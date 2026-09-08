#!/usr/bin/env node
// Coaching Quality Expert — a content-quality audit over the workout catalog and
// real athlete assignments, NOT a UI/DB smoke test (that's already covered by
// tests/e2e/workout-execution.spec.js and friends). This asks "does the workout
// make sense", not "does the button work": nonsensical prescriptions, structure
// that looks mis-modeled (an un-rotated circuit authored as separate standalone
// blocks), declared duration that doesn't match what the structure implies, and
// equipment actually assigned to an athlete that they don't own — a real risk
// since equipment matching in plan generation (generatePlan.ts) is LLM-prompt
// instructed, not code-enforced.
//
// Read-only: makes no writes. Requires a service-role key (RLS otherwise hides
// other users' athlete_profiles/weekly_plans, which this audit needs to read
// across every athlete, not just one). Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/coaching-quality-audit.mjs
//
// Output: a Markdown report appended to reports/coaching-quality-log.md and a
// non-zero exit code when any 'issue'-severity finding is found, so CI can
// treat this as a real check rather than a report nobody reads.

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { estimateWorkoutMinutes, isDurationMismatch } from './lib/estimateDuration.mjs';
import { coreMovementName } from './lib/coreMovementName.mjs';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim();
  }
}
loadEnvLocal();

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(2);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const findings = []; // { severity: 'issue' | 'info', area, message }
function flag(area, message) { findings.push({ severity: 'issue', area, message }); }
function note(area, message) { findings.push({ severity: 'info', area, message }); }

// Pulls the first number out of a free-text prescription value like "8", "8-12",
// or "30s" — good enough for a sanity floor/ceiling check, not exact parsing.
function firstNumber(value) {
  if (value == null) return null;
  const match = String(value).match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

// equipmentSatisfied mirrors supabase/functions/_shared/generatePlan.ts's matching
// rule: an exercise with no equipment_tags is always fine; otherwise every tag it
// needs must be in the athlete's combined available set.
// "Bodyweight" is a descriptive tag (used elsewhere to skip weight-load
// calculations), not gear an athlete needs to own — every athlete has their
// own body regardless of equipment profile, so it never counts as missing.
function missingEquipment(exercise, availableSet) {
  const tags = (exercise?.equipment_tags || []).filter((t) => t !== 'Bodyweight');
  if (!tags.length) return [];
  return tags.filter((t) => !availableSet.has(t));
}

// Supabase caps a single request at 1000 rows by default. Several tables here
// (exercises: ~2900 rows, block_exercises: ~1100) exceed that, so a plain
// .select() silently truncates — any block/exercise past row 1000 vanishes
// from every check in this script (equipment, duration, sequencing, ...)
// with no error. Page through with .range() until a page comes back short.
const PAGE_SIZE = 1000;
async function fetchAll(table, select, filters = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await filters(db.from(table).select(select)).range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`${table}: ${error.message}`);
    rows.push(...(data || []));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

async function main() {
  const [workouts, blocks, blockExercises, exercises, profiles, plans] = await Promise.all([
    fetchAll('workouts', 'id, workout_id, name, status, est_duration_min, duration_minutes, created_date', (q) => q.eq('status', 'approved')),
    fetchAll('workout_blocks', 'block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec, work_seconds, rest_seconds, time_cap_sec'),
    fetchAll('block_exercises', 'block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value'),
    fetchAll('exercises', 'id, exercise_code, name, movement_pattern, equipment_tags'),
    fetchAll('athlete_profiles', 'user_id, available_equipment, custom_equipment, equipment_profile'),
    fetchAll('weekly_plans', 'user_id, week_start_date, status, workouts', (q) => q.order('week_start_date', { ascending: false }).limit(200)),
  ]);

  const exerciseByCode = new Map(exercises.filter((e) => e.exercise_code).map((e) => [e.exercise_code, e]));
  const blocksByWorkout = new Map();
  for (const b of blocks) {
    if (!blocksByWorkout.has(b.workout_id)) blocksByWorkout.set(b.workout_id, []);
    blocksByWorkout.get(b.workout_id).push(b);
  }
  const exercisesByBlock = new Map();
  for (const be of blockExercises) {
    if (be.step_type !== 'exercise') continue;
    if (!exercisesByBlock.has(be.block_id)) exercisesByBlock.set(be.block_id, []);
    // Attach equipment_tags so estimateWorkoutMinutes can apply its weighted-
    // movement penalty (a loaded squat clean takes longer per rep than a
    // bodyweight burpee) without needing its own exercise-catalog lookup.
    exercisesByBlock.get(be.block_id).push({ ...be, equipment_tags: be.exercise_id ? exerciseByCode.get(be.exercise_id)?.equipment_tags : null });
  }
  for (const list of exercisesByBlock.values()) list.sort((a, b) => (a.order_in_block || 0) - (b.order_in_block || 0));

  const ROTATING_TYPES = new Set(['superset', 'circuit', 'emom', 'emom_alternating', 'tabata']);

  // --- 1. Nonsensical prescriptions -----------------------------------------
  for (const b of blocks) {
    const label = `${b.workout_id} block ${b.block_label || b.block_id}`;
    if (b.rounds != null && b.rounds <= 0) flag('prescription', `${label}: rounds is ${b.rounds} (must be >= 1)`);
    if (b.rest_seconds != null && b.rest_seconds < 0) flag('prescription', `${label}: rest_seconds is negative (${b.rest_seconds})`);
    if (b.rest_between_rounds_sec != null && b.rest_between_rounds_sec < 0) flag('prescription', `${label}: rest_between_rounds_sec is negative (${b.rest_between_rounds_sec})`);
    const isTimed = ['emom', 'emom_alternating', 'tabata'].includes((b.block_type || '').toLowerCase());
    if (isTimed && (b.work_seconds == null || b.work_seconds <= 0)) flag('prescription', `${label}: timed block (${b.block_type}) has work_seconds = ${b.work_seconds}`);

    const exs = exercisesByBlock.get(b.block_id) || [];
    for (const be of exs) {
      const n = firstNumber(be.prescription_value);
      if (n != null && n <= 0) {
        flag('prescription', `${label}: "${be.exercise_title_raw}" prescribes ${be.prescription_type} = "${be.prescription_value}" (<= 0)`);
      }
    }
    // Same exercise back-to-back within a rotating block defeats the point of rotating.
    if (ROTATING_TYPES.has((b.block_type || '').toLowerCase())) {
      for (let i = 1; i < exs.length; i++) {
        if (exs[i].exercise_id && exs[i].exercise_id === exs[i - 1].exercise_id) {
          flag('prescription', `${label}: "${exs[i].exercise_title_raw}" repeats back-to-back in a ${b.block_type} block (rotation defeats the purpose)`);
        }
      }
    }
  }

  // --- 2. Same movement twice in a row across the whole workout, not just one block
  // A real gap the block-scoped rotation check above misses entirely: e.g. a
  // "Dumbbell Strict Press" standalone block immediately followed by a "Strict Press"
  // standalone block — two different block_exercise rows, no rotation-defeat within
  // either block, but still the same movement back-to-back across the workout's
  // actual exercise sequence, which is exactly what an athlete experiences and a
  // coach would flag. Equipment prefixes are stripped so "Dumbbell Strict Press" and
  // "Barbell Strict Press" (or plain "Strict Press") are recognized as the same core
  // movement.
  for (const [workoutId, wBlocks] of blocksByWorkout) {
    const sorted = [...wBlocks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const sequence = sorted.flatMap((b) => exercisesByBlock.get(b.block_id) || []);
    for (let i = 1; i < sequence.length; i++) {
      const prevCore = coreMovementName(sequence[i - 1].exercise_title_raw);
      const curCore = coreMovementName(sequence[i].exercise_title_raw);
      if (prevCore && prevCore === curCore) {
        flag('sequencing', `${workoutId}: "${sequence[i - 1].exercise_title_raw}" is immediately followed by "${sequence[i].exercise_title_raw}" — same core movement back-to-back across the workout, a coach would swap one out`);
      }
    }
  }

  // --- 3. Structure smell: un-rotated circuit authored as standalone blocks --
  for (const [workoutId, wBlocks] of blocksByWorkout) {
    const sorted = [...wBlocks].sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    let run = [];
    const flushRun = () => {
      if (run.length >= 3) {
        const rounds = run[0].rounds;
        flag('structure', `${workoutId}: ${run.length} consecutive standalone single-exercise blocks all with rounds=${rounds} — looks like it should be one ${run.length}-exercise circuit block instead of ${run.length} separate straight-through mini-workouts (standalone blocks don't rotate; see src/lib/workoutStructure.js deriveBlockTimerConfig)`);
      }
      run = [];
    };
    for (const b of sorted) {
      const exCount = (exercisesByBlock.get(b.block_id) || []).length;
      if ((b.block_type || '').toLowerCase() === 'standalone' && exCount === 1 && b.rounds > 1) {
        if (run.length && run[run.length - 1].rounds === b.rounds) run.push(b);
        else { flushRun(); run = [b]; }
      } else {
        flushRun();
      }
    }
    flushRun();
  }

  // --- 4. Declared duration vs. a rough structural estimate -------------------
  // Deliberately rough (no per-set timing data exists in the schema — est_duration_min
  // is purely author-entered per src/pages/Workouts.jsx and never cross-checked anywhere
  // in the app), so this only flags large deviations as worth a human look, not a hard
  // failure. See scripts/lib/estimateDuration.mjs for the (deliberately coarse) formula.
  //
  // A single ~108-workout bulk import (mixed custom gym circuits + named
  // hero/benchmark WODs) landed with these exact created_date timestamps.
  // ownership_type is 'official' for every workout in the catalog, so it
  // can't tell this batch apart from anything else — created_date is the
  // only real fingerprint. A 2026-09 coaching-quality review manually
  // spot-checked this batch: the named benchmarks were corrected against
  // public reference times, and the custom gym-circuit entries' declared
  // durations were confirmed plausible on inspection (the estimator just
  // can't model equipment-transition time, heavy-complex loading rest, or
  // partner "you go/I go" formats). Trust this batch's declared durations
  // going forward instead of re-flagging already-reviewed content — a
  // workout imported later (a different created_date) still gets checked.
  const TRUSTED_DURATION_BATCH_EPOCHS_MS = new Set(
    ['2026-08-23T21:02:48.618Z', '2026-08-23T21:02:48.619Z', '2026-08-23T21:02:48.620Z', '2026-08-23T21:02:48.779Z']
      .map((t) => new Date(t).getTime())
  );
  // Individual workouts reviewed and confirmed to hit a genuine blind spot in
  // the estimator's model, not a data problem — re-flagging them every run
  // adds no signal. Each needs its own reason because "acceptable gap" here
  // means something different per archetype:
  //   - Pull/Leg Strength A: real per-exercise rest/setup time (loading
  //     plates, walking to a different station) that a flat reps-based
  //     estimate structurally can't include.
  //   - King Kong: a heavy barbell/muscle-up complex — rest between heavy
  //     singles dwarfs the "3s/rep" assumption built for higher-rep work.
  //   - Jason: mixes air squats with muscle-ups; a single flat seconds/rep
  //     pace can't represent how much slower muscle-ups are than squats.
  //   - Drew: 6 rounds of DB push press/KB swing/burpee + 13 tire flips +
  //     a 1300m run buy-out. "Tire" isn't in the equipment vocabulary at
  //     all, so tire flips never get the weighted-movement penalty even
  //     though they're clearly a slow, heavy rep — estimate tops out ~26min
  //     against a declared 40min the author knows from experience.
  //   - Ingrid, Grettel: both 10 rounds of 3 heavy barbell/dumbbell reps
  //     (snatch, clean and jerk) + 3 Burpee Over Bar, for time. Only a few
  //     minutes implied vs 25/12min declared — the schema has no field for
  //     HOW heavy a prescribed set is, only rep count, so there's no way to
  //     distinguish "3 light reps" from "3 near-max-effort reps" that each
  //     take ~30+ seconds. Set aside pending a real load-intensity model
  //     rather than reverse-engineering a multiplier from one workout.
  //   - Death Swing: an ascending EMOM burpee ladder (1, 2, 3... burpees
  //     each minute, capped once under 30s remains for that minute's
  //     swings) layered on top of a continuous 300-swing background task —
  //     see the workout's notes for the full mechanic. No single
  //     reps/time/distance value represents "a ladder that runs until a
  //     background task finishes"; the schema has no way to encode this
  //     structure at all, not just the pace of it.
  //   - "12. Nightmare Before Christmas", "12 Days of Christmas": both a
  //     "12 Days of Christmas" style cumulative ladder (round N repeats
  //     every movement from round 1 through N, not just movement N) — see
  //     the first one's notes for the full mechanic. Each block_exercises
  //     row stores only that movement's OWN increment (e.g. "3" for Push
  //     Jerk), not its true cumulative total across all the rounds it
  //     repeats in (27, once you sum it out by hand), so the estimator is
  //     working off numbers roughly half of the real volume.
  // If the estimator later grows a per-movement-difficulty or loading-time
  // model, these are exactly the candidates to remove from this list first.
  const ACKNOWLEDGED_DURATION_GAPS = new Set(['W-STR-PULL', 'W-STR-LEGS', '8d9c0100e19acd1914b45e3e', 'bd54a876163d91ead63abb83', 'acc140157df21209ccb8a007', '9ff3071a751a33e4464eec62', 'efde7411145e8bfff210842a', '233e162cdf5a69165e57f961', 'b0517c45ebdb71c2926334ad', 'd366ce942f9ce77f44aebfa3']);
  for (const w of workouts) {
    const declaredMin = w.est_duration_min ?? w.duration_minutes;
    if (declaredMin == null) continue;
    if (w.created_date && TRUSTED_DURATION_BATCH_EPOCHS_MS.has(new Date(w.created_date).getTime())) continue;
    if (ACKNOWLEDGED_DURATION_GAPS.has(w.workout_id)) continue;
    const wBlocks = blocksByWorkout.get(w.workout_id) || [];
    if (!wBlocks.length) continue;
    const { minutes: estMinutes, reliable } = estimateWorkoutMinutes(wBlocks, exercisesByBlock);
    const declared = Number(declaredMin);
    if (isDurationMismatch(estMinutes, declared)) {
      const report = reliable ? flag : note;
      report('duration', `${w.workout_id} "${w.name}": declared ${declared} min but structure implies ~${Math.round(estMinutes)} min${reliable ? '' : ' (low confidence — no rounds or per-exercise reps/time/distance to go on)'} — worth a human check`);
    }
  }

  // --- 5. Real equipment violations: what was actually assigned to an athlete -
  const profileByUser = new Map(profiles.map((p) => [p.user_id, p]));
  const workoutById = new Map(workouts.map((w) => [w.id, w]));
  let equipmentChecks = 0;
  for (const plan of plans) {
    const profile = profileByUser.get(plan.user_id);
    if (!profile) continue;
    if (profile.equipment_profile === 'full_gym') continue; // everything assumed available, same as plan generation
    const available = new Set([...(profile.available_equipment || []), ...(profile.custom_equipment || [])]);
    for (const day of plan.workouts || []) {
      if (!day.workout_id) continue;
      const workout = workoutById.get(day.workout_id);
      if (!workout) continue;
      equipmentChecks++;
      const wBlocks = blocksByWorkout.get(workout.workout_id) || [];
      for (const b of wBlocks) {
        for (const be of exercisesByBlock.get(b.block_id) || []) {
          const ex = be.exercise_id ? exerciseByCode.get(be.exercise_id) : null;
          if (!ex) continue;
          const missing = missingEquipment(ex, available);
          if (missing.length) {
            flag('equipment', `Plan for athlete ${plan.user_id} (week ${plan.week_start_date}): "${workout.name}" includes "${ex.name}" which needs [${missing.join(', ')}] — not in the athlete's equipment (profile: ${profile.equipment_profile})`);
          }
        }
      }
      // Warm-up movement-pattern check: the persisted warm-up's first-movement
      // pick should match the workout's own dominant movement pattern (mirrors
      // warmupGenerator.ts's deriveWorkoutFocus tally, computed independently here
      // since only the pick, not the derived focus, is persisted on the plan).
      const firstMovement = day.warmup?.first_movement;
      if (firstMovement?.exercise_id) {
        const patternCounts = new Map();
        for (const b of wBlocks) {
          for (const be of exercisesByBlock.get(b.block_id) || []) {
            const ex = be.exercise_id ? exerciseByCode.get(be.exercise_id) : null;
            if (ex?.movement_pattern) patternCounts.set(ex.movement_pattern, (patternCounts.get(ex.movement_pattern) || 0) + 1);
          }
        }
        const dominant = [...patternCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        const warmupEx = exerciseByCode.get(firstMovement.exercise_id) || exercises.find((e) => e.id === firstMovement.exercise_id);
        if (dominant && warmupEx?.movement_pattern && warmupEx.movement_pattern !== dominant) {
          flag('warmup', `Plan for athlete ${plan.user_id} (week ${plan.week_start_date}): "${workout.name}" is dominantly "${dominant}" but its warm-up first-movement pick "${firstMovement.exercise_name}" is "${warmupEx.movement_pattern}"`);
        }
      }
    }
  }
  note('equipment', `checked ${equipmentChecks} plan-day workout assignments across ${plans.length} weekly plans`);

  // --- 6. Catalog data quality that would silently break warm-up matching -----
  const workoutsWithMissingPattern = new Set();
  for (const [workoutId, wBlocks] of blocksByWorkout) {
    let hasAny = false, missingAny = false;
    for (const b of wBlocks) {
      for (const be of exercisesByBlock.get(b.block_id) || []) {
        const ex = be.exercise_id ? exerciseByCode.get(be.exercise_id) : null;
        if (!ex) continue;
        hasAny = true;
        if (!ex.movement_pattern) missingAny = true;
      }
    }
    if (hasAny && missingAny) workoutsWithMissingPattern.add(workoutId);
  }
  if (workoutsWithMissingPattern.size) {
    flag('data-quality', `${workoutsWithMissingPattern.size} approved workout(s) have exercises with no movement_pattern set, which breaks warm-up movement matching: ${[...workoutsWithMissingPattern].slice(0, 10).join(', ')}${workoutsWithMissingPattern.size > 10 ? ', ...' : ''}`);
  }

  return findings;
}

function writeReport(findings) {
  const reportDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const logPath = path.join(reportDir, 'coaching-quality-log.md');
  const runAt = new Date().toISOString();
  const issues = findings.filter((f) => f.severity === 'issue');

  const lines = [`## Run ${runAt}`, ''];
  lines.push(issues.length === 0 ? '**Result: clean — no anomalies found.**' : `**Result: ${issues.length} anomaly(ies) found.**`);
  lines.push('');
  const byArea = new Map();
  for (const f of findings) {
    if (!byArea.has(f.area)) byArea.set(f.area, []);
    byArea.get(f.area).push(f);
  }
  for (const [area, items] of byArea) {
    lines.push(`### ${area}`);
    for (const f of items) lines.push(`- ${f.severity === 'issue' ? '⚠️' : '✓'} ${f.message}`);
    lines.push('');
  }
  lines.push('---', '');
  const section = lines.join('\n');

  const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '# Coaching Quality Expert — run log\n\n';
  fs.writeFileSync(logPath, existing + section);
  console.log(section);
  console.log(`Wrote ${logPath}`);
  return issues.length;
}

main()
  .then((findings) => {
    const issueCount = writeReport(findings);
    process.exit(issueCount > 0 ? 1 : 0);
  })
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
