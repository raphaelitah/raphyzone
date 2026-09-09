#!/usr/bin/env node
// Coaching Quality Expert — equipment FUZZ test over the plan GENERATOR itself,
// not real athlete data (that's scripts/coaching-quality-audit.mjs's section 5,
// which only ever sees whichever equipment profile a real athlete already
// happens to have). A bug in filterCatalogForSelection
// (supabase/functions/_shared/planContext.ts) that only manifests for an
// unusual equipment combo (e.g. only a kettlebell + a pull-up bar) could go
// undetected forever since no real athlete owns that combo — this drives the
// REAL generateWeeklyPlan edge function, one equipment profile at a time,
// against a seeded test athlete, and checks every workout it assigns against
// the equipment profile that was actually active for that generation.
//
// Deliberately calls the deployed edge function over HTTP rather than
// reimplementing generatePlan.ts/planContext.ts in Node: they're plain
// TS/pure-logic modules, but they import 'npm:@supabase/supabase-js@2' and
// 'jsr:...' specifiers and call a real LLM (_shared/llm.ts) — porting that
// faithfully would risk testing a reimplementation instead of the real code
// path. Hitting the real HTTP endpoint exercises the exact same code every
// real "Build my week" click runs.
//
// Uses the seeded test-athlete@raphyzone.dev account (tests/e2e/fixtures/auth.js,
// scripts/seed-test-data.sql) — never real athlete 1d6d9f29-6c41-4786-81f3-7dccc01f973e.
// The athlete's real athlete_profiles equipment fields are captured, overwritten
// per profile under test, and restored in a finally block even on error.
// Generated plans are written under week_start_date FUZZ_WEEK_START, far enough
// in the future (year 2099) that they can never collide with a real week, and
// are deleted again at the end of the run regardless of outcome.
//
// Runs ONE profile per invocation (rotated deterministically by calendar
// date across ALL_PROFILES below) rather than all of them, to stay well
// under the LLM provider's 20-requests/day cap when run daily. Pass
// FUZZ_PROFILE=<name> to force a specific profile (e.g. for manual/on-demand
// runs).
//
// Run with:
//   SUPABASE_URL=... SUPABASE_ANON_KEY=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/coaching-quality-equipment-fuzz.mjs

import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

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
const ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL (or VITE_SUPABASE_URL), SUPABASE_ANON_KEY (or VITE_SUPABASE_ANON_KEY), and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(2);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

const TEST_ATHLETE_EMAIL = process.env.TEST_ATHLETE_EMAIL || 'test-athlete@raphyzone.dev';
const TEST_ATHLETE_PASSWORD = process.env.TEST_ATHLETE_PASSWORD || 'TestAthlete123!';
const REAL_ATHLETE_DO_NOT_TOUCH = '1d6d9f29-6c41-4786-81f3-7dccc01f973e';
// Far enough in the future to never collide with a real athlete's actual
// week, and an obvious fuzz-test artifact if cleanup ever fails.
const FUZZ_WEEK_START = '2099-01-05';

const findings = []; // { severity: 'issue' | 'info', area, message }
function flag(area, message) { findings.push({ severity: 'issue', area, message }); }
function note(area, message) { findings.push({ severity: 'info', area, message }); }

// Same equivalency/exemption rules as scripts/coaching-quality-audit.mjs's
// missingEquipment — deliberately not diverging from those semantics (see
// that file for the "Adjustable Dumbbells satisfies Dumbbells" and "Bodyweight
// is always available" reasoning). Duplicated rather than imported because the
// two scripts otherwise share nothing and importing across them would create
// a coupling neither needs; kept byte-for-byte equivalent on purpose.
function missingEquipment(exercise, availableSet) {
  const tags = (exercise?.equipment_tags || []).filter((t) => t !== 'Bodyweight');
  if (!tags.length) return [];
  return tags.filter((t) => !availableSet.has(t));
}

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

// Equipment vocabulary — mirrors src/lib/fitness.js's EQUIPMENT_GROUPS so
// every profile below uses names the catalog's exercise.equipment_tags and
// generatePlan.ts's own filter actually recognize.
const EQUIPMENT_GROUPS = [
  { label: 'Free Weights', items: ['Barbell', 'EZ Bar', 'Dumbbells', 'Adjustable Dumbbells', 'Kettlebell', 'Weight Plates'] },
  { label: 'Machines', items: ['Smith Machine', 'Leg Press', 'Hack Squat Machine', 'Cable Crossover', 'Lat Pulldown', 'Seated Cable Row', 'Chest Press Machine', 'Shoulder Press Machine', 'Leg Extension', 'Leg Curl', 'Pec Deck', 'Calf Raise', 'Hip Thrust', 'Back Extension', 'Assisted Pull-up'] },
  { label: 'Benches & Stations', items: ['Flat Bench', 'Incline Bench', 'Decline Bench', 'Squat Rack', 'Power Rack', 'Pull-up Bar', 'Dip Station'] },
  { label: 'Accessories', items: ['Resistance Bands', 'Suspension Trainer (TRX or similar)', 'Slam Ball', 'Sandbag', 'Jump Rope', 'Step Box', 'Foam Roller', 'Weight Vest', 'Cable', 'Sled'] },
  { label: 'Cardio', items: ['Treadmill', 'Rowing Machine', 'Assault Bike', 'Stationary Bike', 'Stairmaster', 'SkiErg'] },
];
const ALL_EQUIPMENT = EQUIPMENT_GROUPS.flatMap((g) => g.items);
const NON_CARDIO_EQUIPMENT = EQUIPMENT_GROUPS.filter((g) => g.label !== 'Cardio').flatMap((g) => g.items);

// Profiles under test — { name, equipment_profile, available_equipment }.
// custom_equipment mirrors available_equipment for 'custom' profiles (same
// pattern src/components/ProfileEditor.jsx saves), empty for full_gym.
const ALL_PROFILES = [
  { name: 'full_gym', equipment_profile: 'full_gym', available_equipment: ALL_EQUIPMENT },
  { name: 'bodyweight_only', equipment_profile: 'custom', available_equipment: [] },
  { name: 'only_dumbbells', equipment_profile: 'custom', available_equipment: ['Dumbbells'] },
  { name: 'only_barbell', equipment_profile: 'custom', available_equipment: ['Barbell'] },
  { name: 'only_kettlebell', equipment_profile: 'custom', available_equipment: ['Kettlebell'] },
  { name: 'only_resistance_bands', equipment_profile: 'custom', available_equipment: ['Resistance Bands'] },
  { name: 'only_suspension_trainer', equipment_profile: 'custom', available_equipment: ['Suspension Trainer (TRX or similar)'] },
  { name: 'home_gym_combo', equipment_profile: 'custom', available_equipment: ['Adjustable Dumbbells', 'Flat Bench', 'Pull-up Bar'] },
  { name: 'commercial_gym_minus_cardio', equipment_profile: 'custom', available_equipment: NON_CARDIO_EQUIPMENT },
];

// Runs 1 profile/day (LLM-call budget), not all 9 in one run — rotate through
// ALL_PROFILES deterministically by calendar date so every profile gets
// covered roughly once every 9 days, with no state file to maintain. Set
// FUZZ_PROFILE to a name from ALL_PROFILES to force a specific one (used by
// workflow_dispatch for on-demand/manual coverage of one profile).
function selectProfiles() {
  if (process.env.FUZZ_PROFILE) {
    const forced = ALL_PROFILES.find((p) => p.name === process.env.FUZZ_PROFILE);
    if (!forced) throw new Error(`FUZZ_PROFILE "${process.env.FUZZ_PROFILE}" is not one of: ${ALL_PROFILES.map((p) => p.name).join(', ')}`);
    return [forced];
  }
  const daysSinceEpoch = Math.floor(Date.now() / 86400000);
  return [ALL_PROFILES[daysSinceEpoch % ALL_PROFILES.length]];
}
const PROFILES = selectProfiles();

async function callFunction(name, accessToken, body) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
      apikey: ANON_KEY,
    },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`${name} ${res.status}: ${json?.error || res.statusText}`);
  return json;
}

// generateWeeklyPlan paces concurrent generations through a queue
// (plan_generation_jobs — see supabase/functions/_shared/planQueue.ts) and
// returns { queued: true, job_id } instead of a synchronous result whenever
// another job started too recently. That's a normal outcome under real
// traffic, not an error — poll pollPlanJob (which both reports status AND
// drains the queue, exactly like the real frontend does) until it resolves.
async function callGeneratePlan(accessToken) {
  const initial = await callFunction('generateWeeklyPlan', accessToken, { week_start_date: FUZZ_WEEK_START });
  if (!initial?.queued) return initial; // { plan, summary }

  const jobId = initial.job_id;
  const maxAttempts = 40; // ~2 minutes at 3s intervals
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await new Promise((r) => setTimeout(r, 3000));
    const polled = await callFunction('pollPlanJob', accessToken, { job_id: jobId });
    if (polled.status === 'done') return polled;
    if (polled.status === 'failed') throw new Error(`plan generation job ${jobId} failed: ${polled.error}`);
  }
  throw new Error(`plan generation job ${jobId} did not finish within ${maxAttempts * 3}s`);
}

async function deleteFuzzPlan(userId) {
  await db.from('weekly_plans').delete().eq('user_id', userId).eq('week_start_date', FUZZ_WEEK_START);
}

async function main() {
  if (REAL_ATHLETE_DO_NOT_TOUCH === TEST_ATHLETE_EMAIL) throw new Error('refusing to run: TEST_ATHLETE_EMAIL resolves to the protected real athlete');

  const [{ data: signIn, error: signInError }, exercises, blocks, blockExercises, workouts] = await Promise.all([
    anon.auth.signInWithPassword({ email: TEST_ATHLETE_EMAIL, password: TEST_ATHLETE_PASSWORD }),
    fetchAll('exercises', 'id, exercise_code, name, equipment_tags'),
    fetchAll('workout_blocks', 'block_id, workout_id'),
    fetchAll('block_exercises', 'block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw'),
    fetchAll('workouts', 'id, workout_id, name, status', (q) => q.eq('status', 'approved')),
  ]);
  if (signInError || !signIn?.user) throw new Error(`Failed to sign in as ${TEST_ATHLETE_EMAIL}: ${signInError?.message}`);
  const userId = signIn.user.id;
  if (userId === REAL_ATHLETE_DO_NOT_TOUCH) throw new Error('refusing to run: seeded test athlete resolved to the protected real athlete user_id');

  const exerciseByCode = new Map(exercises.filter((e) => e.exercise_code).map((e) => [e.exercise_code, e]));
  const exercisesByBlock = new Map();
  for (const be of blockExercises) {
    if (be.step_type !== 'exercise') continue;
    if (!exercisesByBlock.has(be.block_id)) exercisesByBlock.set(be.block_id, []);
    exercisesByBlock.get(be.block_id).push(be);
  }
  const blocksByWorkoutId = new Map();
  for (const b of blocks) {
    if (!blocksByWorkoutId.has(b.workout_id)) blocksByWorkoutId.set(b.workout_id, []);
    blocksByWorkoutId.get(b.workout_id).push(b);
  }
  const workoutByDbId = new Map(workouts.map((w) => [w.id, w]));

  const { data: profileRows, error: profileFetchError } = await db.from('athlete_profiles').select('*').eq('user_id', userId);
  if (profileFetchError) throw new Error(`athlete_profiles fetch: ${profileFetchError.message}`);
  const originalProfile = profileRows?.[0];
  if (!originalProfile) throw new Error(`No athlete_profiles row found for ${TEST_ATHLETE_EMAIL} (user_id ${userId})`);
  const originalEquipmentFields = {
    equipment_profile: originalProfile.equipment_profile,
    available_equipment: originalProfile.available_equipment,
    custom_equipment: originalProfile.custom_equipment,
  };

  let generationsRun = 0;
  try {
    for (const profile of PROFILES) {
      const patch = {
        equipment_profile: profile.equipment_profile,
        available_equipment: profile.available_equipment,
        custom_equipment: profile.equipment_profile === 'full_gym' ? [] : profile.available_equipment,
      };
      const { error: updateError } = await db.from('athlete_profiles').update(patch).eq('user_id', userId);
      if (updateError) throw new Error(`Failed to set ${profile.name} profile: ${updateError.message}`);

      // Equipment available under this profile, with the same equivalency the
      // real plan generator applies (Adjustable Dumbbells satisfies Dumbbells).
      const available = new Set(patch.available_equipment);
      if (available.has('Adjustable Dumbbells')) available.add('Dumbbells');

      try {
        await deleteFuzzPlan(userId); // clear any prior run's leftover row for this week
        const { plan } = await callGeneratePlan(signIn.session.access_token);
        generationsRun++;
        if (!plan?.workouts?.length) {
          note('equipment-fuzz', `${profile.name}: generation returned no workouts to check (plan may be all rest/activity days)`);
          continue;
        }
        let checked = 0;
        for (const day of plan.workouts) {
          if (!day.workout_id) continue;
          const workout = workoutByDbId.get(day.workout_id);
          if (!workout) {
            note('equipment-fuzz', `${profile.name}: plan assigned workout_id ${day.workout_id} not found in the approved catalog snapshot fetched at run start`);
            continue;
          }
          const wBlocks = blocksByWorkoutId.get(workout.workout_id) || [];
          for (const b of wBlocks) {
            for (const be of exercisesByBlock.get(b.block_id) || []) {
              const ex = be.exercise_id ? exerciseByCode.get(be.exercise_id) : null;
              if (!ex) continue;
              checked++;
              const missing = missingEquipment(ex, available);
              if (missing.length) {
                flag('equipment-fuzz', `Profile "${profile.name}" (${day.day}): "${workout.name}" includes "${ex.name}" which needs [${missing.join(', ')}] — not available under this profile`);
              }
            }
          }
        }
        note('equipment-fuzz', `${profile.name}: generated plan, checked ${checked} exercise assignments across ${plan.workouts.filter((d) => d.workout_id).length} assigned workouts`);
      } finally {
        await deleteFuzzPlan(userId); // never leave a fuzz-test plan row behind, pass or fail
      }
    }
  } finally {
    const { error: restoreError } = await db.from('athlete_profiles').update(originalEquipmentFields).eq('user_id', userId);
    if (restoreError) {
      // Surfaced as an issue-severity finding (not just a console error) since
      // a failed restore leaves the seeded test athlete's profile corrupted
      // for every other test/script that relies on it.
      flag('equipment-fuzz', `FAILED to restore original equipment fields for ${TEST_ATHLETE_EMAIL} (user_id ${userId}): ${restoreError.message} — original values were: ${JSON.stringify(originalEquipmentFields)}`);
    } else {
      note('equipment-fuzz', `restored ${TEST_ATHLETE_EMAIL}'s original equipment_profile/available_equipment/custom_equipment after ${generationsRun}/${PROFILES.length} profile generations`);
    }
  }

  return findings;
}

function writeReport(findings) {
  const reportDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const logPath = path.join(reportDir, 'coaching-quality-log.md');
  const runAt = new Date().toISOString();
  const issues = findings.filter((f) => f.severity === 'issue');

  const lines = [`## Equipment Fuzz Run ${runAt}`, ''];
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
