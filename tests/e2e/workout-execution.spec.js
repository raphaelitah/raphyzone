import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

test.describe('Running a workout (regression)', () => {
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

    // Skip every exercise (skipping never requires filling in weight/distance)
    // until we reach and click "Finish workout".
    const finishButton = page.getByRole('button', { name: /finish workout/i });
    for (let i = 0; i < 50; i++) {
      if (await finishButton.isVisible().catch(() => false)) break;
      await page.getByRole('button', { name: /skip/i }).click();
      await page.getByRole('button', { name: /next/i }).click();
    }
    await page.getByRole('button', { name: /skip/i }).click();
    await expect(finishButton).toBeEnabled();
    await finishButton.click();

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
});
