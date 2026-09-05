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
// normally lift for this" prompt before a weight suggestion can be shown. It sits
// on top of the exercise screen's own Skip button, so skip-through regression tests
// need to dismiss it (via the sheet's close control) the same way they dismiss the
// warm-up screen — otherwise every skip attempt hangs waiting for a button that's
// present but covered.
async function dismissCalibrationPromptIfPresent(page) {
  const closeButton = page.getByRole('button', { name: /^close$/i });
  if (await closeButton.isVisible({ timeout: 500 }).catch(() => false)) {
    await closeButton.click();
    // Radix animates the backdrop out rather than removing it immediately — a
    // click right after this can still land on it ("intercepts pointer events")
    // if the very next action fires before the animation finishes.
    await closeButton.waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});
  }
}

test.describe('Running a workout (regression)', () => {
  test.beforeEach(async () => {
    // Clear any in-progress session left over from a prior (e.g. failed) run —
    // only one in_progress session per user is allowed, and the app blocks
    // starting a new workout with a "Workout already in progress" dialog
    // otherwise.
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    await api.from('workout_sessions').delete().eq('user_id', signInData.user.id).eq('status', 'in_progress');
  });

  test('start a workout, skip through every exercise, and finish it', async ({ page }) => {
    await login(page);
    await page.goto('/workouts');

    const cards = page.locator('button:has(p.font-semibold)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await cards.first().click();

    const sheet = page.getByRole('dialog');
    const startLink = sheet.getByRole('link', { name: /start workout/i });
    await expect(startLink).toBeVisible();
    await startLink.click();

    await page.waitForURL(/\/workout\/.+/, { timeout: 10000 });
    const workoutId = page.url().split('/workout/')[1];
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
        await startBlockButton.click();
      }
      // Skipping the last exercise navigates to /progress asynchronously — that
      // can land between this loop's top-of-iteration URL check and this click,
      // leaving no "Skip" button to find. Not stuck, just finished; stop instead
      // of waiting out the full click timeout on a page that no longer has one.
      if (!(await skipButton.first().isVisible({ timeout: 2000 }).catch(() => false))) break;
      await skipButton.first().click();
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
      await startBlockButton.click();
    }
    await skipButton.first().click();
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
    await dismissCalibrationPromptIfPresent(page);
    await page.locator('header button').first().click();
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
      await startBlockButton.click();
    }
    await skipButton.first().click();
    await expect(page.getByText(/Exercise 2 of/i)).toBeVisible({ timeout: 10000 });

    await dismissCalibrationPromptIfPresent(page);
    await page.locator('header button').filter({ has: page.locator('svg.lucide-rotate-ccw') }).click();
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
