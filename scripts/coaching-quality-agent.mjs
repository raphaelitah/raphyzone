#!/usr/bin/env node
// Coaching Quality Expert — logs into the real app as a dedicated athlete (QA_COACH,
// scripts/seed-test-data.sql) and actually executes real catalog workouts through the
// UI the way a human athlete would: real "Start set" / "Done" taps, real rest
// countdowns (verified, not just skipped past), real weight/feedback/note entry on
// every completion screen — then reports in plain language whether it ran smoothly,
// whether every rest transition felt natural, and whether the declared duration
// holds up against what the prescribed sets and rest actually add up to.
//
// This is distinct from tests/e2e/workout-execution.spec.js (a pass/fail regression
// check that skips through everything to confirm the button works) and
// scripts/coaching-quality-audit.mjs (a static data audit with no browser at all) —
// this one drives a real browser and narrates a judgment per workout, the way a
// meticulous athlete would leave feedback after a session.
//
// UI interaction model (verified live against the dev server before writing this):
//   - Rotating multi-exercise blocks (superset) and solo/standalone exercises both
//     render via SupersetPanel: "Start set" -> ~8-10s "Get ready" lead-in -> "Done"
//     -> (if rest_seconds > 0) a "Rest" countdown with a "Skip rest" button -> repeat
//     for every round, then a "<Exercise> complete" / "<Block> complete" log screen
//     with a "Max weight used (kg)" input (prefilled via placeholder with the
//     athlete's target weight, or a "Bodyweight" toggle), "Easy/Normal/Hard/Failed"
//     feedback buttons, an optional note, and "Save & Continue".
//   - Timer-driven blocks (circuit/EMOM/tabata) render via WorkoutTimerPanel instead:
//     an explicit "Start <block>" arms a ticking timer with no per-phase UI control
//     other than a whole-block "Skip <block>" — there's no equivalent to "Skip rest"
//     to verify a single phase, and no weight-logging screen for these (the app
//     doesn't offer one), so this agent narrates those structurally (from the DB
//     prescription) rather than by watching each phase tick live.
//   - A plain "Skip" button is always available underneath (bypasses everything,
//     logs nothing) — the agent treats it as a last-resort recovery only, never a
//     normal path, since using it would mean never reaching the real log screen.
//   - The Weight tile (ExerciseSpecRow) only renders its little refresh icon when
//     the app itself has decided the exercise is loadable and has no target weight
//     yet — the agent taps it whenever present and flags it if no suggestion comes
//     back, since a coach would expect one for a calibrated athlete.
//
// Also checks (both here, live, and structurally in coaching-quality-audit.mjs) for
// the same core movement appearing back-to-back across the whole workout — e.g. a
// "Dumbbell Strict Press" block immediately followed by a plain "Strict Press"
// block — which no single-block rotation check catches.
//
// Tracks what it's already reviewed in the coaching_agent_reviews table so a nightly
// run only re-executes a workout that's new or has changed since its last review
// (content_updated_at < the workout's current effective updated_date across
// workouts/workout_blocks/block_exercises), instead of re-running the whole catalog
// every night.
//
// Run with:
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... BASE_URL=http://localhost:5173 \
//     node scripts/coaching-quality-agent.mjs [batchSize]

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
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
const BASE_URL = process.env.BASE_URL || 'http://localhost:5173';
// Real interactions (typing, real "Get ready" lead-ins, a short tick-check per rest
// phase) run in seconds per exercise, not minutes, so a nightly batch of 15-20
// workouts comfortably finishes in well under half an hour. Raise this once you've
// watched a run or two and are happy with the pace — see the README note.
const BATCH_SIZE = parseInt(process.argv[2] || process.env.AGENT_BATCH_SIZE || '15', 10);
const QA_COACH = {
  email: process.env.TEST_QA_COACH_EMAIL || 'qa-coach@raphyzone.dev',
  password: process.env.TEST_QA_COACH_PASSWORD || 'QaCoach123!',
};

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('SUPABASE_URL (or VITE_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.');
  process.exit(2);
}
const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const TIMER_DRIVEN_TYPES = new Set(['circuit', 'emom', 'emom_alternating', 'tabata']);

// Picks up to `limit` approved workouts that are new (never reviewed) or have
// changed since their last review, oldest/never-reviewed first, so coverage rotates
// across the catalog over successive nightly runs instead of hammering the same
// handful of workouts.
async function selectWorkoutsToReview(limit) {
  const [{ data: workouts }, { data: blocks }, { data: reviews }] = await Promise.all([
    db.from('workouts').select('id, workout_id, name, est_duration_min, duration_minutes, updated_date').eq('status', 'approved'),
    db.from('workout_blocks').select('block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec, work_seconds, rest_seconds, updated_date'),
    db.from('coaching_agent_reviews').select('workout_id, content_updated_at'),
  ]);

  const blocksByWorkout = new Map();
  for (const b of blocks || []) {
    if (!blocksByWorkout.has(b.workout_id)) blocksByWorkout.set(b.workout_id, []);
    blocksByWorkout.get(b.workout_id).push(b);
  }
  const reviewByWorkout = new Map((reviews || []).map((r) => [r.workout_id, r]));

  const candidates = (workouts || []).map((w) => {
    const wBlocks = (blocksByWorkout.get(w.workout_id) || []).sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
    const effectiveUpdatedAt = [w.updated_date, ...wBlocks.map((b) => b.updated_date)]
      .filter(Boolean)
      .reduce((max, d) => (d > max ? d : max), w.updated_date || '1970-01-01');
    const review = reviewByWorkout.get(w.workout_id);
    const needsReview = !review || review.content_updated_at < effectiveUpdatedAt;
    return { workout: w, blocks: wBlocks, effectiveUpdatedAt, review, needsReview };
  }).filter((c) => c.needsReview && c.blocks.length > 0);

  candidates.sort((a, b) => {
    if (!a.review && b.review) return -1;
    if (a.review && !b.review) return 1;
    if (!a.review && !b.review) return 0;
    return a.review.reviewed_at < b.review.reviewed_at ? -1 : 1;
  });

  return candidates.slice(0, limit);
}

async function fetchExercisesForBlocks(blockIds) {
  if (!blockIds.length) return new Map();
  const { data } = await db.from('block_exercises').select('block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block').in('block_id', blockIds).eq('step_type', 'exercise');
  const byBlock = new Map();
  for (const be of data || []) {
    if (!byBlock.has(be.block_id)) byBlock.set(be.block_id, []);
    byBlock.get(be.block_id).push(be);
  }
  for (const list of byBlock.values()) list.sort((a, b) => (a.order_in_block || 0) - (b.order_in_block || 0));
  return byBlock;
}

async function login(page) {
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel(/email/i).fill(QA_COACH.email);
  await page.getByLabel(/password/i).fill(QA_COACH.password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}

// Fills every visible completion card (one for a solo exercise, several at once for
// a finished superset block) with a realistic weight (typing back whatever the app
// itself suggests via the input's placeholder — its calibration-derived target — or
// leaving "Bodyweight" toggled when there's no weight field at all), a "Normal"
// feedback rating, and a short note, then saves. Returns the number of entries filled.
async function fillLogPromptAndSave(page, log) {
  // page.locator('div', { has: ... }) matches every ancestor div that contains the
  // label, not just its immediate card — with one exercise that coincidentally
  // resolves fine, but with several (a finished superset logs all of them at once)
  // it grabs a shared outer container instead of each exercise's own scope. Walking
  // up from the label itself to its nearest ".mb-3" ancestor (the actual per-exercise
  // wrapper in ExerciseSpecRow's completion card) scopes it correctly per exercise.
  const weightLabels = page.getByText('Max weight used (kg)');
  const weightCount = await weightLabels.count();
  for (let i = 0; i < weightCount; i++) {
    const card = weightLabels.nth(i).locator('xpath=ancestor::div[contains(@class, "mb-3")][1]');
    const input = card.locator('input[type="number"]');
    if (await input.count()) {
      const placeholder = await input.getAttribute('placeholder');
      const value = placeholder && placeholder !== '0' ? placeholder : '0';
      await input.fill(value);
      log.weightsLogged.push(value);
    }
  }

  const feedbackButtons = page.getByRole('button', { name: /^normal$/i });
  const feedbackCount = await feedbackButtons.count();
  for (let i = 0; i < feedbackCount; i++) await feedbackButtons.nth(i).click();

  const notes = page.getByPlaceholder(/optional note/i);
  const noteCount = await notes.count();
  for (let i = 0; i < noteCount; i++) await notes.nth(i).fill('Coaching Quality Expert — automated review run.');

  // This save can finish the whole workout (last block), which navigates away
  // asynchronously — a timeout here after we've already landed on /progress means
  // it worked, not that it's stuck.
  try {
    await page.getByRole('button', { name: /^save( ?& ?continue)?$/i }).click({ timeout: 10000 });
  } catch (err) {
    if (!/\/progress/.test(page.url())) throw err;
  }
  return Math.max(weightCount, feedbackCount, noteCount);
}

// Watches a "Rest" / "Resting" / "Rest before next block" countdown wherever it
// appears, records the transition (declared vs. observed vs. ground truth), confirms
// it's actually ticking (not frozen), and returns whether one was seen at all.
async function checkRestBanner(page, expectedSeconds, transitionLabel, log) {
  // Scoped to <span> because ExerciseSpecRow's always-present "REST" spec tile is a
  // <p> with the exact same text ("Rest") — a plain getByText(/^rest$/i) matches that
  // tile even when no rest phase is active at all, which is not what we want to detect.
  const restBadge = page.locator('span', { hasText: /^rest$/i }).first();
  const restingBanner = page.getByText(/^resting$/i).or(page.getByText(/rest before next block/i)).first();
  const seenBadge = await restBadge.isVisible({ timeout: 600 }).catch(() => false);
  const seenBanner = !seenBadge && await restingBanner.isVisible({ timeout: 600 }).catch(() => false);
  if (!seenBadge && !seenBanner) {
    if (expectedSeconds > 0) {
      log.transitions.push({ label: transitionLabel, natural: false, note: `expected ~${expectedSeconds}s rest but none was shown — jumps straight into the next exercise, feels abrupt` });
    }
    return false;
  }
  const countdown = page.getByText(/^\d{2}:\d{2}$/).first();
  const first = await countdown.textContent().catch(() => null);
  await page.waitForTimeout(1200);
  const second = await countdown.textContent().catch(() => null);
  const ticking = first != null && second != null && first !== second;
  const natural = ticking && (expectedSeconds === 0 || expectedSeconds > 0);
  log.transitions.push({
    label: transitionLabel,
    natural,
    note: ticking ? `rest counted down naturally from ${first}` : `rest banner shown (${first ?? '?'}) but the countdown did not appear to tick — feels frozen/stuck`,
  });
  return true;
}

// If tapping the weight refresh finds the athlete has never calibrated this exact
// movement pattern, the app opens QuickCalibrationSheet.jsx — a one-question bottom
// sheet ("<Pattern> — pick a movement + enter a weight") rather than silently
// failing. That's expected, correct behavior, not a bug: a real athlete would fill
// it in, so this does too (first listed movement option, a plausible default
// weight), which also means later exercises in the same run benefit from it.
async function fillQuickCalibrationIfShown(page, log) {
  const sheetSaveBtn = page.getByRole('button', { name: /^save & get suggested weight$/i });
  if (!(await sheetSaveBtn.isVisible({ timeout: 1500 }).catch(() => false))) return false;

  // The Sheet's own "Close" button renders before the movement options in DOM
  // order, so a plain "first button in the dialog" grabs that instead — scope to
  // the options' own distinctive classes (QuickCalibrationSheet.jsx) to actually
  // pick a movement rather than dismissing the sheet unfilled.
  const dialog = page.getByRole('dialog');
  const firstOption = dialog.locator('button.rounded-xl.border.px-4.py-3.text-left').first();
  await firstOption.click().catch(() => {});
  await dialog.locator('input[type="number"]').fill('20').catch(() => {});
  await sheetSaveBtn.click({ timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(800);
  log.weightsLogged.push('quick-calibrated-on-request');
  return true;
}

// ExerciseSpecRow (src/components/ExerciseSpecRow.jsx) only renders the small
// refresh icon next to the "Weight" tile when the app itself has determined the
// exercise is loadable AND has no suggested weight yet (onClick is only wired up
// when `requiresWeight && !exercise.target_weight`) — so the icon's presence is a
// reliable, DOM-driven signal of "this should have a calibrated suggestion but
// doesn't," with no need to cross-reference the athlete's calibration separately.
// A coach reviewing this screen would expect tapping it to actually produce one —
// unless the athlete genuinely has no calibration for it yet, in which case the
// app should (and does) ask a quick question instead of just failing quietly.
async function checkWeightSuggestion(page, log) {
  const weightLabel = page.locator('p', { hasText: /^weight$/i }).first();
  if (!(await weightLabel.isVisible({ timeout: 500 }).catch(() => false))) return;
  const hasRefreshIcon = (await weightLabel.locator('svg').count().catch(() => 0)) > 0;
  if (!hasRefreshIcon) return; // bodyweight/running exercise, or already has a suggested weight

  await weightLabel.click().catch(() => {});
  // This triggers a real network round trip (assignWorkoutWeights edge function).
  // A fixed short wait risks moving on before it resolves, leaving its eventual
  // state update (setExercises/persistWeight) to land later — possibly after we've
  // already advanced to a different exercise, which could easily explain a session
  // occasionally looking like it "jumped back" for no reason. Poll for the loading
  // spinner to actually clear instead of guessing a fixed delay.
  const loadingSpinner = weightLabel.locator('..').locator('svg.animate-spin');
  for (let waited = 0; waited < 8000; waited += 400) {
    if (!(await loadingSpinner.isVisible().catch(() => false))) break;
    await page.waitForTimeout(400);
  }
  if (await fillQuickCalibrationIfShown(page, log)) return;

  const stillMissing = (await weightLabel.locator('svg').count().catch(() => 0)) > 0;
  if (stillMissing) {
    log.weightIssues.push('tapped the weight-suggestion refresh but no value came back and no calibration prompt appeared — a coach would expect one or the other here');
  } else {
    log.weightsLogged.push('suggested-on-request');
  }
}

// Reads whichever exercise name is currently headlined on screen (SupersetPanel and
// WorkoutTimerPanel both render it as `<p class="text-lg font-semibold text-center">`)
// and flags it against the previous exercise's name at genuine exercise boundaries
// (`log.justCompletedExercise`, set after a log-prompt save or a block/exercise
// skip — a multi-round exercise re-shows the same heading every round, which is
// normal repetition, not what this is looking for). This catches two different real
// problems with the same symptom: the content genuinely repeating a movement
// back-to-back (coaching-quality-audit.mjs also catches this statically), and a
// session-state bug where a block finishes but the app re-renders its first exercise
// again instead of finishing — confirmed live once (see reports/coaching-quality-log.md:
// a 40-round block's "Save & Continue" left `logPrompt.review` true, which short-circuits
// handleSaveLogPrompt's advance/finish, while completedBlockTimers already had the
// block marked done — so it fell back to rendering exercise index 0 solo).
async function checkConsecutiveMovement(page, log) {
  if (!log.justCompletedExercise) return;
  const heading = page.locator('p.text-lg.font-semibold.text-center').first();
  const text = await heading.textContent({ timeout: 500 }).catch(() => null);
  if (!text) return;
  const core = coreMovementName(text);
  if (core && log.lastExerciseCore && core === log.lastExerciseCore) {
    log.movementIssues.push(`"${log.lastExerciseName}" is immediately followed by "${text.trim()}" again right after it was just completed — either the content repeats the movement back-to-back, or the session didn't advance properly`);
  }
  if (core) { log.lastExerciseCore = core; log.lastExerciseName = text.trim(); log.justCompletedExercise = false; }
}

// Executes one workout end to end, narrating what happened rather than asserting
// pass/fail. Real "Start set"/"Done"/"Skip rest" interaction for solo and superset
// blocks (see the file header); a coarser block-level "Start"/"Skip <block>" for
// timer-driven circuit/EMOM/tabata blocks, since the app offers no per-phase control
// or weight-logging screen for those.
async function runWorkout(page, candidate, qaCoachId) {
  const consoleErrors = [];
  const onConsole = (msg) => { if (msg.type() === 'error') consoleErrors.push(msg.text()); };
  const onPageError = (err) => consoleErrors.push(err.message);
  page.on('console', onConsole);
  page.on('pageerror', onPageError);

  const log = { weightsLogged: [], weightIssues: [], movementIssues: [], lastExerciseCore: null, lastExerciseName: null, justCompletedExercise: true, transitions: [], usedFallbackSkip: 0, timerDrivenBlocks: [] };
  let warmupShown = false;
  let finished = false;
  let iterations = 0;
  const maxIterations = 250;

  try {
    await page.goto(`${BASE_URL}/workout/${candidate.workout.id}`);

    // A stray in-progress session can slip past the per-candidate cleanup in main()
    // — e.g. the previous workout's finish() write lands just after that delete
    // ran — and the app blocks with a "Workout already in progress" dialog neither
    // "Skip warm up" nor any exercise-screen control matches, which otherwise stalls
    // the whole run at zero steps for no visible reason.
    const endInProgress = page.getByRole('button', { name: /^end it & start this one$/i });
    if (await endInProgress.isVisible({ timeout: 3000 }).catch(() => false)) {
      await endInProgress.click();
    }

    const skipWarmup = page.getByRole('button', { name: /^skip warm up$/i });
    const exerciseHeading = page.getByText(/Exercise \d+ of/i);
    await Promise.race([
      skipWarmup.waitFor({ state: 'visible', timeout: 15000 }),
      exerciseHeading.waitFor({ state: 'visible', timeout: 15000 }),
    ]).catch(() => {});
    if (await skipWarmup.isVisible().catch(() => false)) {
      warmupShown = true;
      await skipWarmup.click();
      await exerciseHeading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
    }

    // The app can navigate away to /progress asynchronously right after a click
    // that finishes the workout (the last "Done"/save/skip), so a button that was
    // visible a moment ago can vanish mid-click purely because the workout ended,
    // not because anything is actually stuck — that's success, not a failure.
    // clickIfFinishing wraps every action so that race resolves as "finished"
    // rather than an unhandled timeout that would abort the whole run.
    const clickIfFinishing = async (locator, timeout = 10000) => {
      try {
        await locator.click({ timeout });
        return 'clicked';
      } catch (err) {
        if (/\/progress/.test(page.url())) return 'finished';
        throw err;
      }
    };

    for (; iterations < maxIterations; iterations++) {
      if (!/\/workout\//.test(page.url())) break;

      const startBlock = page.getByRole('button', { name: /^start (?!set$|workout$)/i });
      const startSet = page.getByRole('button', { name: /^start set$/i });
      const doneBtn = page.getByRole('button', { name: /^done$/i });
      const skipRestBtn = page.getByRole('button', { name: /^skip rest$/i });
      const saveBtn = page.getByRole('button', { name: /^save( ?& ?continue)?$/i }); // not QuickCalibrationSheet's "Save & get suggested weight"
      const blockSkip = page.getByRole('button', { name: /^skip [a-z]/i }); // e.g. "Skip circuit", "Skip superset"
      const plainSkip = page.getByRole('button', { name: /^skip$/i });

      const dbg = (branch) => { if (process.env.DEBUG_AGENT) console.error(`[${iterations}] branch=${branch}`); };

      if (await startBlock.isVisible().catch(() => false)) {
        dbg('startBlock');
        const label = await startBlock.textContent().catch(() => 'block');
        log.timerDrivenBlocks.push(label?.trim());
        await checkRestBanner(page, 0, `entering ${label?.trim() || 'next block'}`, log);
        await checkConsecutiveMovement(page, log);
        if ((await clickIfFinishing(startBlock)) === 'finished') break;
        continue;
      }
      if (await startSet.isVisible().catch(() => false)) {
        dbg('startSet');
        await checkConsecutiveMovement(page, log);
        await checkWeightSuggestion(page, log);
        if ((await clickIfFinishing(startSet)) === 'finished') break;
        // A real "Get ready" lead-in (~8-10s) follows before "Done" appears. "Skip
        // <block>" is always visible throughout a superset (even during Start
        // set/lead-in), so waiting for it here — properly, via waitFor, not a
        // one-shot isVisible() — matters: without it, the generic branch fallthrough
        // below would treat "Done not visible yet" as license to hit that always-on
        // escape hatch mid-countdown and prematurely end the whole block.
        const doneReady = await doneBtn.waitFor({ state: 'visible', timeout: 15000 }).then(() => true).catch(() => false);
        if (doneReady) {
          dbg('done (after lead-in)');
          if ((await clickIfFinishing(doneBtn)) === 'finished') break;
        }
        continue;
      }
      if (await skipRestBtn.isVisible().catch(() => false)) {
        dbg('skipRest');
        await checkRestBanner(page, null, 'between rounds', log);
        if ((await clickIfFinishing(skipRestBtn)) === 'finished') break;
        continue;
      }
      if (await saveBtn.isVisible().catch(() => false)) {
        dbg('save');
        await fillLogPromptAndSave(page, log);
        log.justCompletedExercise = true; // the exercise/block this log screen was for has now genuinely concluded
        continue;
      }
      if (await blockSkip.isVisible().catch(() => false)) {
        dbg('blockSkip:' + (await blockSkip.textContent().catch(() => '?')));
        // Timer-driven block (circuit/EMOM/tabata) — no per-phase control available.
        log.justCompletedExercise = true;
        if ((await clickIfFinishing(blockSkip)) === 'finished') break;
        continue;
      }
      if (await plainSkip.isVisible().catch(() => false)) {
        dbg('plainSkip');
        log.usedFallbackSkip++;
        log.justCompletedExercise = true;
        if ((await clickIfFinishing(plainSkip)) === 'finished') break;
        continue;
      }
      if (process.env.DEBUG_AGENT) {
        await page.screenshot({ path: `/tmp/agent-stuck-${candidate.workout.workout_id}-${iterations}.png` }).catch(() => {});
        console.error('STUCK at', page.url(), 'body text:', (await page.locator('body').innerText().catch(() => '')).slice(0, 500));
      }
      break; // nothing recognized
    }

    finished = /\/progress/.test(page.url())
      ? true
      : await page.waitForURL(/\/progress/, { timeout: 15000 }).then(() => true).catch(() => false);
  } finally {
    page.off('console', onConsole);
    page.off('pageerror', onPageError);
  }

  const exerciseCountByBlock = new Map(candidate.blocks.map((b) => [b.block_id, (candidate.exercisesByBlock.get(b.block_id) || []).length]));
  const estimatedMinutes = Math.round(estimateWorkoutMinutes(candidate.blocks, exerciseCountByBlock));
  const declaredMinutes = candidate.workout.est_duration_min ?? candidate.workout.duration_minutes ?? null;

  // workout_sessions.workout_id stores the workout's UUID (candidate.workout.id, same
  // as the /workout/:id URL) — not workouts.workout_id, the human-readable text code
  // used elsewhere (e.g. coaching_agent_reviews.workout_id).
  const { data: sessions } = await db.from('workout_sessions').select('status').eq('workout_id', candidate.workout.id).eq('user_id', qaCoachId).order('created_date', { ascending: false }).limit(1);
  const sessionStatus = sessions?.[0]?.status;

  const problems = [];
  if (!finished) problems.push(`got stuck after ${iterations} steps and never reached the finish screen`);
  if (consoleErrors.length) problems.push(`${consoleErrors.length} browser error(s) during the run (${consoleErrors.slice(0, 2).join(' | ')})`);
  if (finished && sessionStatus !== 'completed') problems.push(`UI redirected to finish, but the session is "${sessionStatus ?? 'missing'}" in the database, not "completed"`);
  if (log.usedFallbackSkip > 0) problems.push(`had to fall back to the plain "Skip" button ${log.usedFallbackSkip} time(s) — an unrecognized screen state`);
  const unnaturalTransitions = log.transitions.filter((t) => !t.natural);
  for (const t of unnaturalTransitions) problems.push(`transition (${t.label}): ${t.note}`);
  for (const issue of log.weightIssues) problems.push(issue);
  for (const issue of log.movementIssues) problems.push(issue);

  let durationNote = null;
  if (declaredMinutes != null) {
    const declared = Number(declaredMinutes);
    if (isDurationMismatch(estimatedMinutes, declared)) {
      durationNote = `took ~${estimatedMinutes} min if you follow every prescribed set and rest, while the catalog says ${declared} min`;
      problems.push(durationNote);
    } else {
      durationNote = `~${estimatedMinutes} min structurally, close to the declared ${declared} min`;
    }
  }

  const verdict = problems.length ? 'flagged' : 'clean';
  const naturalTransitions = log.transitions.filter((t) => t.natural);
  const feelNote = log.transitions.length
    ? `${naturalTransitions.length}/${log.transitions.length} rest transitions felt natural`
    : (log.timerDrivenBlocks.length ? `${log.timerDrivenBlocks.length} timer-driven block(s) executed structurally (no per-phase UI to verify live)` : 'no block transitions to check');
  const executionLine = finished && !consoleErrors.length ? 'execution ran smooth' : 'execution had problems';
  const summary = problems.length
    ? `Did "${candidate.workout.name}" — ${executionLine}, ${feelNote}, but: ${problems.join('; ')}.`
    : `Did "${candidate.workout.name}" — everything is good, ${feelNote}. ${durationNote ? durationNote[0].toUpperCase() + durationNote.slice(1) + '.' : ''}`;

  return {
    workoutId: candidate.workout.workout_id,
    verdict,
    summary,
    details: {
      warmupShown, estimatedMinutes, declaredMinutes, sessionStatus, consoleErrorCount: consoleErrors.length, finished,
      weightsLogged: log.weightsLogged.length, weightIssues: log.weightIssues, movementIssues: log.movementIssues, transitions: log.transitions, fallbackSkips: log.usedFallbackSkip,
      timerDrivenBlocks: log.timerDrivenBlocks,
    },
  };
}

function writeReport(runResults) {
  const reportDir = path.resolve(process.cwd(), 'reports');
  fs.mkdirSync(reportDir, { recursive: true });
  const logPath = path.join(reportDir, 'coaching-quality-log.md');
  const runAt = new Date().toISOString();
  const flagged = runResults.filter((r) => r.verdict === 'flagged');

  const lines = [`## Agent run ${runAt}`, ''];
  lines.push(runResults.length === 0
    ? '_Nothing new or changed to review — every approved workout is up to date._'
    : flagged.length === 0
      ? `**Reviewed ${runResults.length} workout(s), all clean.**`
      : `**Reviewed ${runResults.length} workout(s), ${flagged.length} flagged.**`);
  lines.push('');
  for (const r of runResults) lines.push(`- ${r.verdict === 'flagged' ? '⚠️' : '✓'} ${r.summary}`);
  lines.push('', '---', '');
  const section = lines.join('\n');

  const existing = fs.existsSync(logPath) ? fs.readFileSync(logPath, 'utf8') : '# Coaching Quality Expert — run log\n\n';
  fs.writeFileSync(logPath, existing + section);
  console.log(section);
  return flagged.length;
}

async function main() {
  const candidates = await selectWorkoutsToReview(BATCH_SIZE);
  if (!candidates.length) {
    console.log('No workouts need review — everything up to date.');
    writeReport([]);
    return 0;
  }

  const blockIds = candidates.flatMap((c) => c.blocks.map((b) => b.block_id));
  const exercisesByBlock = await fetchExercisesForBlocks(blockIds);
  for (const c of candidates) c.exercisesByBlock = exercisesByBlock;

  const { data: usersPage } = await db.auth.admin.listUsers();
  const qaCoachId = usersPage?.users?.find((u) => u.email === QA_COACH.email)?.id;
  if (!qaCoachId) throw new Error(`Could not find a user for ${QA_COACH.email} — has scripts/seed-test-data.sql been run against this project?`);
  await db.from('workout_sessions').delete().eq('user_id', qaCoachId).eq('status', 'in_progress');

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await login(page);
  // A freshly-started Vite dev server (every CI run) compiles modules on demand —
  // the first real page load can take much longer than normal and blow through the
  // per-workout wait budgets below. One throwaway navigation here absorbs that cold
  // start before any candidate is timed.
  await page.goto(`${BASE_URL}/workouts`, { timeout: 60000 }).catch(() => {});
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});

  const results = [];
  for (const candidate of candidates) {
    await db.from('workout_sessions').delete().eq('user_id', qaCoachId).eq('status', 'in_progress');
    // An unexpected crash on one workout (a genuinely unrecognized screen state,
    // a browser-level failure) shouldn't take down the rest of the night's batch —
    // record it as flagged and move on, same as any other reviewed problem.
    let result;
    try {
      result = await runWorkout(page, candidate, qaCoachId);
    } catch (err) {
      result = {
        workoutId: candidate.workout.workout_id,
        verdict: 'flagged',
        summary: `Did "${candidate.workout.name}" — the agent itself crashed mid-run: ${err.message}`,
        details: { crashed: true, error: err.message },
      };
    }
    results.push(result);
    await db.from('coaching_agent_reviews').upsert({
      workout_id: result.workoutId,
      content_updated_at: candidate.effectiveUpdatedAt,
      verdict: result.verdict,
      summary: result.summary,
      details: result.details,
      reviewed_at: new Date().toISOString(),
      updated_date: new Date().toISOString(),
    });
  }

  await browser.close();
  return writeReport(results);
}

main()
  .then((flaggedCount) => process.exit(flaggedCount > 0 ? 1 : 0))
  .catch((err) => {
    console.error(err);
    process.exit(2);
  });
