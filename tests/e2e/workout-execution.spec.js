import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient, findMultiExerciseWorkoutId } from './fixtures/apiClient';

// The workout page shows a "Warm Up" screen (with its own "Skip warm up" /
// "Start Workout" buttons) before the first exercise whenever the athlete's
// profile produces one for that workout — dismiss it if present so tests can
// assert on the exercise sequence itself. A no-op when there's no warm up.
async function dismissWarmupIfPresent(page) {
  const skipWarmup = page.getByRole('button', { name: /^skip warm up$/i });
  const exerciseHeading = page.getByText(/Exercise \d+ of/i);
  // Wait for whichever screen the page settles on (loading the workout can
  // take a couple of seconds) rather than racing a short fixed timeout.
  await Promise.race([
    skipWarmup.waitFor({ state: 'visible', timeout: 15000 }),
    exerciseHeading.waitFor({ state: 'visible', timeout: 15000 }),
  ]).catch(() => {});
  if (await skipWarmup.isVisible().catch(() => false)) {
    await skipWarmup.click();
    await exerciseHeading.waitFor({ state: 'visible', timeout: 10000 }).catch(() => {});
  }
}

// QuickCalibrationSheet.jsx pops up over an exercise whenever the athlete has no
// calibration for its movement pattern yet, asking a one-question "what do you
// normally lift for this" prompt before a weight suggestion can be shown. It can
// appear before *any* exercise in a workout, not just the first, and reappears for
// the next exercise moments after being dismissed — so a one-shot dismiss-then-click
// isn't reliable (the sheet can pop back in the gap between them, especially on a
// slower CI runner). dismissCalibrationPromptIfPresent closes it if present, right
// now; clickThroughCalibration wraps a click with a short retry loop that keeps
// clearing it until the actual target click goes through.
async function dismissCalibrationPromptIfPresent(page) {
  const closeButton = page.getByRole('button', { name: /^close$/i });
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.click().catch(() => {});
    // Radix animates the backdrop out rather than removing it immediately — a
    // click right after this can still land on it ("intercepts pointer events")
    // if the very next action fires before the animation finishes.
    await closeButton.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

async function clickThroughCalibration(page, locator, options = {}) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    await dismissCalibrationPromptIfPresent(page);
    try {
      await locator.click({ timeout: 6000, ...options });
      return;
    } catch (err) {
      if (attempt === 5) throw err;
    }
  }
}

// One entry per CALIBRATION_PATTERNS key (src/lib/fitness.js) so
// WorkoutExecution's automatic QuickCalibrationSheet popup (fires whenever the
// current exercise's movement pattern has zero calibration entries at all) never
// interrupts these skip-through flows. Set directly here — rather than trusting
// scripts/seed-test-data.sql alone — because ATHLETE's calibration is shared,
// mutable state other spec files (calibration.spec.js, the quick-calibration test
// below) also legitimately modify mid-run; asserting it fresh in this describe
// block's own beforeEach is what actually keeps it stable regardless of run order.
const FULL_CALIBRATION = [
  { pattern: 'squat', exercise: 'Barbell Back Squat', weight_kg: 60 },
  { pattern: 'hinge', exercise: 'Deadlift', weight_kg: 80 },
  { pattern: 'horizontal_push', exercise: 'Bench Press', weight_kg: 50 },
  { pattern: 'vertical_push', exercise: 'Standing Overhead Press', weight_kg: 30 },
  { pattern: 'horizontal_pull', exercise: 'Dumbbell Row', weight_kg: 20 },
  { pattern: 'vertical_pull', exercise: 'Lat Pulldown', weight_kg: 40 },
  { pattern: 'olympic_power', exercise: 'Single DB Snatch', weight_kg: 15 },
];

test.describe('Running a workout (regression)', () => {
  test.beforeEach(async () => {
    // Clear any in-progress session left over from a prior (e.g. failed) run —
    // only one in_progress session per user is allowed, and the app blocks
    // starting a new workout with a "Workout already in progress" dialog
    // otherwise.
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    await api.from('workout_sessions').delete().eq('user_id', signInData.user.id).eq('status', 'in_progress');
    await api.from('athlete_profiles').update({ strength_calibration: FULL_CALIBRATION }).eq('user_id', signInData.user.id);
  });

  test('start a workout, skip through every exercise, and finish it', async ({ page }) => {
    // Clicking "the first card" in the live catalog used to pick the workout here,
    // but that's order-dependent and occasionally lands on a long multi-block
    // benchmark (dozens of exercises), which made this test wildly flaky in CI —
    // anywhere from ~8s to over two minutes for the exact same code. The card-click
    // UI path itself (library -> detail sheet -> "Start workout" link) is already
    // covered by workouts.spec.js, so this test only needs a workout guaranteed to
    // have a small, bounded exercise count.
    const setupApi = makeApiClient();
    await setupApi.auth.signInWithPassword(ATHLETE);
    const workoutId = await findMultiExerciseWorkoutId(setupApi);

    await login(page);
    await page.goto(`/workout/${workoutId}`);
    await dismissWarmupIfPresent(page);

    // Skip every exercise (skipping never requires filling in weight/distance).
    // Skip both advances and logs in one action — there's no separate "Next"
    // step, and skipping the last exercise finishes the workout and redirects
    // to /progress directly, with no "Finish workout" button to click. A
    // block-scoped timer (superset/EMOM/Tabata) must be started before its
    // "Skip <block>" button appears, so start one if we land on an unarmed block.
    const skipButton = page.getByRole('button', { name: /^skip/i });
    const startBlockButton = page.getByRole('button', { name: /^start /i });
    for (let i = 0; i < 50; i++) {
      if (!/\/workout\//.test(page.url())) break;
      await dismissCalibrationPromptIfPresent(page);
      if (await startBlockButton.isVisible().catch(() => false)) {
        await clickThroughCalibration(page, startBlockButton);
      }
      // Skipping the last exercise navigates to /progress asynchronously — that
      // can land between this loop's top-of-iteration URL check and this click,
      // leaving no "Skip" button to find. Not stuck, just finished; stop instead
      // of waiting out the full click timeout on a page that no longer has one.
      if (!(await skipButton.first().isVisible({ timeout: 2000 }).catch(() => false))) break;
      await clickThroughCalibration(page, skipButton.first());
    }

    await page.waitForURL(/\/progress/, { timeout: 15000 });

    // Confirm the session was actually persisted as completed, not just a UI redirect.
    const api = makeApiClient();
    const { data: signInData, error: signInError } = await api.auth.signInWithPassword(ATHLETE);
    expect(signInError).toBeFalsy();
    const { data: sessions } = await api
      .from('workout_sessions')
      .select('status')
      .eq('workout_id', workoutId)
      .eq('user_id', signInData.user.id)
      .order('created_date', { ascending: false })
      .limit(1);
    expect(sessions?.[0]?.status).toBe('completed');
  });

  test('leaving mid-workout and coming back resumes where the athlete left off', async ({ page }) => {
    // Navigate straight to a workout known to have several exercises — picking
    // "the first card" in the library is order-dependent on the live catalog and
    // can land on a single-exercise workout, finishing (not landing on exercise 2)
    // as soon as it's skipped.
    const setupApi = makeApiClient();
    await setupApi.auth.signInWithPassword(ATHLETE);
    const workoutId = await findMultiExerciseWorkoutId(setupApi);

    await login(page);
    await page.goto(`/workout/${workoutId}`);
    await dismissWarmupIfPresent(page);

    // Skip past the first exercise/block so there's real progress to resume.
    const skipButton = page.getByRole('button', { name: /^skip/i });
    const startBlockButton = page.getByRole('button', { name: /^start /i });
    await dismissCalibrationPromptIfPresent(page);
    if (await startBlockButton.isVisible().catch(() => false)) {
      await clickThroughCalibration(page, startBlockButton);
    }
    await clickThroughCalibration(page, skipButton.first());
    await expect(page.getByText(/Exercise 2 of/i)).toBeVisible({ timeout: 10000 });

    // The advanced index is persisted to workout_sessions.progress in a background
    // (non-debounced, fire-and-forget) effect — wait for that write to land before
    // leaving, otherwise resuming can race it and land back on exercise 1.
    const progressApi = makeApiClient();
    await progressApi.auth.signInWithPassword(ATHLETE);
    await expect.poll(async () => {
      const { data } = await progressApi.from('workout_sessions').select('progress').eq('workout_id', workoutId).eq('status', 'in_progress').maybeSingle();
      return data?.progress?.index;
    }, { timeout: 10000 }).toBe(1);

    // Leave via the header back chevron — this must NOT abandon the session.
    await clickThroughCalibration(page, page.locator('header button').first());
    await page.waitForURL((url) => !/\/workout\//.test(url.pathname), { timeout: 10000 });

    // The resume banner should now be visible from any other screen, with a running clock.
    const resumeBanner = page.getByRole('button', { name: /^Resume /i });
    await expect(resumeBanner).toBeVisible({ timeout: 10000 });

    // Confirm the session survived in the backend as in_progress, not skipped.
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: sessions } = await api
      .from('workout_sessions')
      .select('status')
      .eq('user_id', signInData.user.id)
      .eq('status', 'in_progress')
      .order('created_date', { ascending: false })
      .limit(1);
    expect(sessions?.[0]?.status).toBe('in_progress');

    // Tapping the banner returns to the workout — landing back past exercise 1,
    // not stranded on the first exercise again.
    await resumeBanner.click();
    await page.waitForURL(/\/workout\//, { timeout: 10000 });
    await expect(page.getByText(/Exercise 2 of/i)).toBeVisible({ timeout: 10000 });
  });

  test('restarting mid-workout replaces the session instead of leaving a duplicate or crashing', async ({ page }) => {
    // See the previous test for why we navigate straight to a known
    // multi-exercise workout instead of clicking "the first card".
    const setupApi = makeApiClient();
    await setupApi.auth.signInWithPassword(ATHLETE);
    const workoutId = await findMultiExerciseWorkoutId(setupApi);

    await login(page);
    await page.goto(`/workout/${workoutId}`);
    await dismissWarmupIfPresent(page);

    // Make some progress so there's a real prior session to replace.
    const skipButton = page.getByRole('button', { name: /^skip/i });
    const startBlockButton = page.getByRole('button', { name: /^start /i });
    await dismissCalibrationPromptIfPresent(page);
    if (await startBlockButton.isVisible().catch(() => false)) {
      await clickThroughCalibration(page, startBlockButton);
    }
    await clickThroughCalibration(page, skipButton.first());
    await expect(page.getByText(/Exercise 2 of/i)).toBeVisible({ timeout: 10000 });

    await clickThroughCalibration(page, page.locator('header button').filter({ has: page.locator('svg.lucide-rotate-ccw') }));
    await page.getByRole('button', { name: /^restart$/i }).click();
    // Restarting creates a fresh session, so its own warm up screen reappears.
    await dismissWarmupIfPresent(page);

    // Lands back on exercise 1 of a fresh, still-usable session — not a crash.
    await expect(page.getByText(/Exercise 1 of/i)).toBeVisible({ timeout: 10000 });

    // Exactly one in_progress session for this workout, not two.
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: sessions } = await api
      .from('workout_sessions')
      .select('id, status')
      .eq('workout_id', workoutId)
      .eq('user_id', signInData.user.id)
      .eq('status', 'in_progress');
    expect(sessions?.length).toBe(1);
  });
});

// Dedicated workout whose very first exercise (Wall Ball Squat, a "Squat"
// movement pattern) has no prescribed load — chosen via direct DB queries so
// the popup is guaranteed to appear on the first exercise without needing to
// skip through others first. See QuickCalibrationSheet.jsx / calcWeight in
// WorkoutExecution.jsx for the behavior under test.
const QUICK_CALIBRATION_WORKOUT_ID = '9d387467-5940-47b1-a4a0-f55d412dd3f1';

test.describe('Quick calibration prompt mid-workout', () => {
  let api;
  let profileId;
  let originalCalibration;

  test.beforeEach(async () => {
    api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: before } = await api
      .from('athlete_profiles')
      .select('id, strength_calibration')
      .eq('user_id', signInData.user.id)
      .single();
    profileId = before.id;
    originalCalibration = before.strength_calibration;

    // Remove any existing "squat" calibration so the prompt is guaranteed to
    // fire, and clear a stale in-progress session the same way the other
    // describe block above does.
    const withoutSquat = (before.strength_calibration || []).filter((c) => c.pattern !== 'squat');
    await api.from('athlete_profiles').update({ strength_calibration: withoutSquat }).eq('id', profileId);
    await api.from('workout_sessions').delete().eq('user_id', signInData.user.id).eq('status', 'in_progress');
  });

  test.afterEach(async () => {
    await api.from('athlete_profiles').update({ strength_calibration: originalCalibration }).eq('id', profileId);
  });

  test('prompts once, saves the answer, and never asks again for that pattern', async ({ page }) => {
    await login(page);
    await page.goto(`/workout/${QUICK_CALIBRATION_WORKOUT_ID}`);
    await dismissWarmupIfPresent(page);

    // The popup surfaces as soon as the first exercise loads, without needing
    // to trigger a weight-suggestion fetch manually.
    await expect(page.getByText(/^Squat Pattern$/)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText(/comfortably squat/i)).toBeVisible();

    await page.getByRole('button', { name: 'Barbell Back Squat' }).click();
    await page.getByPlaceholder('e.g. 60').fill('100');
    await page.getByRole('button', { name: /^save & get suggested weight$/i }).click();

    // Saving closes the sheet and persists the answer — no further prompt for
    // this exercise/pattern.
    await expect(page.getByText(/^Squat Pattern$/)).not.toBeVisible({ timeout: 10000 });

    const { data: after } = await api
      .from('athlete_profiles')
      .select('strength_calibration')
      .eq('id', profileId)
      .single();
    const squatEntry = (after.strength_calibration || []).find((c) => c.pattern === 'squat');
    expect(squatEntry?.exercise).toBe('Barbell Back Squat');
    expect(squatEntry?.weight_kg).toBeCloseTo(100, 0);

    // Reloading the same exercise (fresh page load re-runs the "surface the
    // prompt" effect) must not ask again now that the pattern is calibrated.
    await page.reload();
    await dismissWarmupIfPresent(page);
    await page.waitForTimeout(2000);
    await expect(page.getByText(/^Squat Pattern$/)).not.toBeVisible();
  });
});
