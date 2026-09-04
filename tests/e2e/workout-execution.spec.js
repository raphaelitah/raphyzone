import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

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
      if (await startBlockButton.isVisible().catch(() => false)) {
        await startBlockButton.click();
      }
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

    // Skip past the first exercise/block so there's real progress to resume.
    const skipButton = page.getByRole('button', { name: /^skip/i });
    const startBlockButton = page.getByRole('button', { name: /^start /i });
    if (await startBlockButton.isVisible().catch(() => false)) {
      await startBlockButton.click();
    }
    await skipButton.first().click();
    await expect(page.getByText(/Exercise 2 of/i)).toBeVisible({ timeout: 10000 });

    // Leave via the header back chevron — this must NOT abandon the session.
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

    // Make some progress so there's a real prior session to replace.
    const skipButton = page.getByRole('button', { name: /^skip/i });
    const startBlockButton = page.getByRole('button', { name: /^start /i });
    if (await startBlockButton.isVisible().catch(() => false)) {
      await startBlockButton.click();
    }
    await skipButton.first().click();
    await expect(page.getByText(/Exercise 2 of/i)).toBeVisible({ timeout: 10000 });

    await page.locator('header button').filter({ has: page.locator('svg.lucide-rotate-ccw') }).click();
    await page.getByRole('button', { name: /^restart$/i }).click();

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
