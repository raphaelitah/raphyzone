import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

// Seeded athlete is already calibrated=true (scripts/seed-test-data.sql), so
// finishing the wizard redirects to /profile rather than /plan (see
// src/pages/StrengthCalibration.jsx's wasCalibrated branch).
test.describe('Strength Calibration', () => {
  let api;
  let profileId;
  let originalCalibration;

  test.beforeEach(async () => {
    api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: before } = await api
      .from('athlete_profiles')
      .select('id, calibrated, strength_calibration, strength_known')
      .eq('user_id', signInData.user.id)
      .single();
    profileId = before.id;
    originalCalibration = { calibrated: before.calibrated, strength_calibration: before.strength_calibration, strength_known: before.strength_known };
  });

  test.afterEach(async () => {
    await api.from('athlete_profiles').update(originalCalibration).eq('id', profileId);
  });

  test('skipping through every pattern still finishes and marks calibrated', async ({ page }) => {
    await login(page);
    await page.goto('/calibration');

    await expect(page.getByText(/^Step 1 of \d+$/)).toBeVisible();

    // "Skip" advances regardless of whether a movement was picked, and finishes
    // the wizard on the last step without requiring any selection.
    const skipButton = page.getByRole('button', { name: /^skip$/i });
    for (let i = 0; i < 10; i++) {
      if (!/\/calibration/.test(page.url())) break;
      await skipButton.click();
    }

    await page.waitForURL(/\/profile/, { timeout: 10000 });

    const { data: after } = await api.from('athlete_profiles').select('calibrated, strength_calibration').eq('id', profileId).single();
    expect(after.calibrated).toBe(true);
    expect((after.strength_calibration || []).length).toBe(0);
  });

  test('choosing a movement and weight persists that pattern\'s calibration', async ({ page }) => {
    await login(page);
    await page.goto('/calibration');

    await expect(page.getByText(/^Squat Pattern$/)).toBeVisible();
    await page.getByRole('button', { name: 'Barbell Back Squat' }).click();
    await page.getByPlaceholder('e.g. 60').fill('80');
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Skip the rest to reach the end quickly.
    const skipButton = page.getByRole('button', { name: /^skip$/i });
    for (let i = 0; i < 10; i++) {
      if (!/\/calibration/.test(page.url())) break;
      await skipButton.click();
    }
    await page.waitForURL(/\/profile/, { timeout: 10000 });

    const { data: after } = await api.from('athlete_profiles').select('calibrated, strength_calibration').eq('id', profileId).single();
    expect(after.calibrated).toBe(true);
    const squatEntry = (after.strength_calibration || []).find((c) => c.pattern === 'squat');
    expect(squatEntry?.exercise).toBe('Barbell Back Squat');
    expect(squatEntry?.weight_kg).toBeCloseTo(80, 0);
  });
});
