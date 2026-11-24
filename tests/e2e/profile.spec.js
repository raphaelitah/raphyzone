import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

test.describe('Profile', () => {
  test('editing the display name persists via auth metadata', async ({ page }) => {
    await login(page);
    await page.goto('/profile');

    await expect(page.getByText('Test Athlete', { exact: true })).toBeVisible();

    await page.locator('header button').first().click();

    const dialog = page.getByRole('dialog', { name: /edit name/i });
    await expect(dialog).toBeVisible();
    const input = dialog.getByPlaceholder('Your name');
    await input.fill('Test Athlete Renamed');
    await dialog.getByRole('button', { name: /^save$/i }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByText('Test Athlete Renamed')).toBeVisible({ timeout: 10000 });

    // Verify persisted server-side, then restore the original name so other specs
    // (which assume "Test Athlete") aren't affected.
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    expect(signInData.user.user_metadata.full_name).toBe('Test Athlete Renamed');
    await api.auth.updateUser({ data: { full_name: 'Test Athlete' } });
  });

  test('toggling auto-approve AI plans saves immediately, no explicit save step', async ({ page }) => {
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: before } = await api.from('athlete_profiles').select('id, auto_approve_plans').eq('user_id', signInData.user.id).single();
    const originalValue = !!before.auto_approve_plans;

    await login(page);
    await page.goto('/profile');

    const toggle = page.getByRole('switch');
    await expect(toggle).toBeVisible();
    await toggle.click();

    await expect.poll(async () => {
      const { data } = await api.from('athlete_profiles').select('auto_approve_plans').eq('id', before.id).single();
      return !!data.auto_approve_plans;
    }, { timeout: 10000 }).toBe(!originalValue);

    // Restore original state.
    await api.from('athlete_profiles').update({ auto_approve_plans: originalValue }).eq('id', before.id);
  });

  test('training profile editor autosaves a body-focus change', async ({ page }) => {
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: before } = await api.from('athlete_profiles').select('id, body_focus').eq('user_id', signInData.user.id).single();
    const originalBodyFocus = before.body_focus || [];

    await login(page);
    await page.goto('/profile');

    await page.getByRole('button', { name: 'Edit' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('tab', { name: /basics/i })).toBeVisible();

    const chipLabel = originalBodyFocus.includes('Core') ? 'Balanced' : 'Core';
    await sheet.getByRole('button', { name: chipLabel, exact: true }).click();

    // Wait for the debounced autosave to fire and reflect "Saved".
    await expect(sheet.getByText(/^saved$/i)).toBeVisible({ timeout: 10000 });

    await expect.poll(async () => {
      const { data } = await api.from('athlete_profiles').select('body_focus').eq('id', before.id).single();
      return data.body_focus || [];
    }, { timeout: 10000 }).toContain(chipLabel);

    // Restore.
    await api.from('athlete_profiles').update({ body_focus: originalBodyFocus }).eq('id', before.id);
  });
  test('core finisher: the one-off prompt on Home saves the choice, and the profile editor adjusts the length', async ({ page }) => {
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    const { data: before } = await api.from('athlete_profiles')
      .select('id, core_finisher_enabled, core_finisher_rounds, calibrated, secondary_goal, training_history')
      .eq('user_id', signInData.user.id).single();
    try {
      // Unreviewed (null) is what existing users have; make the earlier Home prompts not win.
      await api.from('athlete_profiles').update({
        core_finisher_enabled: null, calibrated: true,
        secondary_goal: before.secondary_goal && before.secondary_goal !== 'none' ? before.secondary_goal : 'endurance',
        training_history: before.training_history || 'intermediate',
      }).eq('id', before.id);

      await login(page);
      await page.evaluate((uid) => localStorage.removeItem(`profileGapsDismissed:${uid}`), signInData.user.id);
      await page.goto('/');
      await expect(page.getByText(/new: add a 10-minute core finisher/i)).toBeVisible({ timeout: 15000 });
      await page.getByRole('button', { name: /^yes, offer it$/i }).click();
      await expect.poll(async () => {
        const { data } = await api.from('athlete_profiles').select('core_finisher_enabled').eq('id', before.id).single();
        return data.core_finisher_enabled;
      }, { timeout: 10000 }).toBe(true);

      // Length is adjustable from the profile editor and autosaves.
      await page.goto('/profile');
      await page.getByRole('button', { name: /edit/i }).first().click();
      const card = page.getByTestId('core-finisher-settings');
      await card.scrollIntoViewIfNeeded();
      await card.getByRole('button', { name: /^7 min$/ }).click();
      await expect.poll(async () => {
        const { data } = await api.from('athlete_profiles').select('core_finisher_rounds').eq('id', before.id).single();
        return data.core_finisher_rounds;
      }, { timeout: 10000 }).toBe(6);
    } finally {
      await api.from('athlete_profiles').update({
        core_finisher_enabled: before.core_finisher_enabled,
        core_finisher_rounds: before.core_finisher_rounds,
        calibrated: before.calibrated,
        secondary_goal: before.secondary_goal,
        training_history: before.training_history,
      }).eq('id', before.id);
    }
  });
});
