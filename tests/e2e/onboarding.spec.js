import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

// The seeded athlete is already onboarded (scripts/seed-test-data.sql), so this
// spec temporarily marks it unonboarded to drive the real first-run wizard —
// src/components/Layout.jsx redirects any route to /onboarding while
// profile.onboarded is falsy, and back to "/" once it flips true. Original
// profile state is restored in afterEach regardless of outcome so later specs
// (which assume an onboarded, calibrated athlete) aren't affected.
test.describe('Onboarding', () => {
  let api;
  let profileId;
  let originalProfile;

  test.beforeEach(async () => {
    api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: before } = await api
      .from('athlete_profiles')
      .select('id, onboarded, goal, experience_level, equipment_profile, available_equipment, training_days, available_training_days, strength_known, strength_calibration, calibrated, calibrated_date')
      .eq('user_id', signInData.user.id)
      .single();
    profileId = before.id;
    originalProfile = { ...before };
    delete originalProfile.id;
    await api.from('athlete_profiles').update({ onboarded: false }).eq('id', profileId);
  });

  test.afterEach(async () => {
    await api.from('athlete_profiles').update(originalProfile).eq('id', profileId);
  });

  test('completing the wizard saves the profile and lands past onboarding', async ({ page }) => {
    await login(page);
    await page.waitForURL(/\/onboarding/, { timeout: 10000 });

    // Step 1: Goal — OptionCard buttons carry both a title and a description
    // paragraph, so match by the description text rather than the ambiguous
    // combined accessible name.
    await expect(page.getByText(/^Step 1 of 5$/)).toBeVisible();
    await page.getByText('Move heavier weight over time').click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 2: Experience
    await expect(page.getByText(/^Step 2 of 5$/)).toBeVisible();
    await page.getByText('3+ years, familiar with periodization').click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 3: Equipment — Full Gym satisfies canProceed without picking individual items.
    await expect(page.getByText(/^Step 3 of 5$/)).toBeVisible();
    await page.getByText('Complete commercial gym — all equipment enabled automatically.').click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 4: Schedule
    await expect(page.getByText(/^Step 4 of 5$/)).toBeVisible();
    await page.getByRole('button', { name: /^mon$/i }).click();
    await page.getByRole('button', { name: /^wed$/i }).click();
    await page.getByRole('button', { name: /^fri$/i }).click();
    await page.getByRole('button', { name: /^continue$/i }).click();

    // Step 5: Strength — skip entering lifts.
    await expect(page.getByText(/^Step 5 of 5$/)).toBeVisible();
    await page.getByText("Skip for now — we'll learn from your logged sessions.").click();
    await page.getByRole('button', { name: /^finish$/i }).click();

    await page.waitForURL((url) => !/\/onboarding/.test(url.pathname), { timeout: 10000 });

    const { data: after } = await api
      .from('athlete_profiles')
      .select('onboarded, goal, experience_level, equipment_profile, training_days, calibrated')
      .eq('id', profileId)
      .single();
    expect(after.onboarded).toBe(true);
    expect(after.goal).toBe('strength');
    expect(after.experience_level).toBe('advanced');
    expect(after.equipment_profile).toBe('full_gym');
    expect(after.training_days).toEqual(expect.arrayContaining(['Monday', 'Wednesday', 'Friday']));
    expect(after.calibrated).toBe(false);
  });
});
