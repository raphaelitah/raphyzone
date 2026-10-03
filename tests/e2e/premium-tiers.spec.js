import { test, expect } from '@playwright/test';
import { login, ATHLETE, ADMIN, FREE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

// One real sign-in per account for the whole file — password sign-ins are
// rate-limited, and each test only needs an authenticated client.
const clients = new Map();
function apiAs(user) {
  if (!clients.has(user.email)) {
    clients.set(user.email, (async () => {
      const api = makeApiClient();
      const { error } = await api.auth.signInWithPassword(user);
      if (error) throw new Error(`sign-in failed for ${user.email}: ${error.message}`);
      return api;
    })());
  }
  return clients.get(user.email);
}

async function firstApprovedWorkout(api) {
  const { data } = await api.from('workouts').select('id, name, is_free').eq('status', 'approved').order('name').limit(1);
  return data[0];
}

test.describe('Free / premium tiers', () => {
  // A leftover in-progress session (one allowed per user) would make the
  // session-insert checks below fail for the wrong reason.
  test.beforeEach(async () => {
    const free = await apiAs(FREE);
    await free.from('workout_sessions').delete().eq('status', 'in_progress');
  });

  test('free-tier user reports free status and the configured AI quota', async () => {
    const api = await apiAs(FREE);
    const { data, error } = await api.rpc('my_entitlement');
    expect(error).toBeNull();
    expect(data.is_premium).toBe(false);
    expect(data.reason).toBe('free');
    expect(data.ai_limit).toBeGreaterThanOrEqual(0);
    expect(data.ai_remaining).toBeLessThanOrEqual(data.ai_limit);
  });

  test('premium accounts have full access and no AI limit', async () => {
    const api = await apiAs(ATHLETE);
    const { data } = await api.rpc('my_entitlement');
    expect(data.is_premium).toBe(true);
    expect(data.ai_limit).toBeNull();
  });

  test('clients cannot grant themselves access or edit settings', async () => {
    const api = await apiAs(FREE);
    const { data: { user } } = await api.auth.getUser();
    const upsert = await api.from('user_entitlements').upsert({ user_id: user.id, premium_override: true });
    expect(upsert.error).not.toBeNull();
    const settings = await api.from('app_settings').update({ value: 999 }).eq('key', 'free_ai_actions_per_month').select();
    expect(settings.data ?? []).toHaveLength(0);
    const { data } = await api.rpc('my_entitlement');
    expect(data.is_premium).toBe(false);
  });

  test('locked workouts cannot be started; admin-flagged free ones can', async () => {
    const admin = await apiAs(ADMIN);
    const free = await apiAs(FREE);
    const { data: { user } } = await free.auth.getUser();
    const workout = await firstApprovedWorkout(admin);
    const originallyFree = workout.is_free;

    try {
      await admin.from('workouts').update({ is_free: false }).eq('id', workout.id);
      const blocked = await free.from('workout_sessions')
        .insert({ user_id: user.id, workout_id: workout.id, workout_name: workout.name, date: new Date().toISOString().slice(0, 10), status: 'in_progress' });
      expect(blocked.error?.code).toBe('42501');

      await admin.from('workouts').update({ is_free: true }).eq('id', workout.id);
      const allowed = await free.from('workout_sessions')
        .insert({ user_id: user.id, workout_id: workout.id, workout_name: workout.name, date: new Date().toISOString().slice(0, 10), status: 'in_progress' })
        .select().single();
      expect(allowed.error).toBeNull();
      await free.from('workout_sessions').delete().eq('id', allowed.data.id);
    } finally {
      await admin.from('workouts').update({ is_free: originallyFree }).eq('id', workout.id);
    }
  });

  test('a free user cannot change a catalog workout free flag', async () => {
    const admin = await apiAs(ADMIN);
    const free = await apiAs(FREE);
    const workout = await firstApprovedWorkout(admin);
    await admin.from('workouts').update({ is_free: false }).eq('id', workout.id);
    await free.from('workouts').update({ is_free: true }).eq('id', workout.id);
    const { data } = await admin.from('workouts').select('is_free').eq('id', workout.id).single();
    expect(data.is_free).toBe(false);
  });

  test('library shows locks and offers an upgrade instead of Start', async ({ page }) => {
    const admin = await apiAs(ADMIN);
    const workout = await firstApprovedWorkout(admin);
    await admin.from('workouts').update({ is_free: false }).eq('id', workout.id);

    await login(page, FREE);
    await page.goto('/workouts');
    await expect(page.getByTestId('plan-banner')).toContainText('Free plan');
    const cards = page.locator('button:has(p.font-semibold)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Premium', { exact: true }).first()).toBeVisible();

    // Locked cards are blurred, and tapping one goes straight to the upgrade
    // sheet rather than revealing the workout.
    const locked = page.getByRole('button', { name: `${workout.name} (Premium)` });
    await expect(locked).toBeVisible();
    await locked.click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByText('This workout is premium')).toBeVisible();
    await expect(sheet.getByRole('link', { name: /start workout/i })).toHaveCount(0);
  });

  test('opening a locked workout directly shows the premium screen', async ({ page }) => {
    const admin = await apiAs(ADMIN);
    const workout = await firstApprovedWorkout(admin);
    await admin.from('workouts').update({ is_free: false }).eq('id', workout.id);

    await login(page, FREE);
    await page.goto(`/workout/${workout.id}`);
    await expect(page.getByRole('heading', { name: /is premium/i })).toBeVisible({ timeout: 15000 });
  });

  test('premium users see no locks or plan banner', async ({ page }) => {
    await login(page);
    await page.goto('/workouts');
    await expect(page.locator('button:has(p.font-semibold)').first()).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Premium', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('plan-banner')).toHaveCount(0);
  });

  test('profile shows premium status for premium accounts', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    await expect(page.getByTestId('plan-card')).toContainText('Premium');
  });

  test('free users see their plan and can pick a billing period', async ({ page }) => {
    await login(page, FREE);
    await page.goto('/profile');
    const card = page.getByTestId('plan-card');
    await expect(card).toContainText('Free plan');
    await card.getByRole('button', { name: 'Upgrade' }).click();
    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('radio', { name: /Annual/ })).toHaveAttribute('aria-checked', 'true');
    await sheet.getByRole('radio', { name: /Monthly/ }).click();
    await expect(sheet.getByRole('radio', { name: /Monthly/ })).toHaveAttribute('aria-checked', 'true');
    await expect(sheet.getByRole('button', { name: /continue to payment/i })).toBeEnabled();
  });

  test('turning the paywall off gives everyone full access, and back on restores it', async () => {
    const admin = await apiAs(ADMIN);
    const free = await apiAs(FREE);
    const { data: { user } } = await free.auth.getUser();
    const workout = await firstApprovedWorkout(admin);
    await admin.from('workouts').update({ is_free: false }).eq('id', workout.id);
    const session = { user_id: user.id, workout_id: workout.id, workout_name: workout.name, date: new Date().toISOString().slice(0, 10), status: 'in_progress' };

    try {
      const off = await admin.from('app_settings').update({ value: false }).eq('key', 'paywall_enabled');
      expect(off.error).toBeNull();
      const { data: open } = await free.rpc('my_entitlement');
      expect(open.is_premium).toBe(true);
      expect(open.reason).toBe('open');
      expect(open.paywall_enabled).toBe(false);
      const started = await free.from('workout_sessions').insert(session).select().single();
      expect(started.error).toBeNull();
      await free.from('workout_sessions').delete().eq('id', started.data.id);
    } finally {
      await admin.from('app_settings').update({ value: true }).eq('key', 'paywall_enabled');
    }

    const { data: locked } = await free.rpc('my_entitlement');
    expect(locked.is_premium).toBe(false);
    expect(locked.reason).toBe('free');
    const blocked = await free.from('workout_sessions').insert(session);
    expect(blocked.error?.code).toBe('42501');
  });

  test('admin sees plan status per user and the limits form', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin-users');
    await expect(page.getByTestId('limits-form')).toBeVisible();
    await expect(page.getByRole('switch', { name: /free \/ paid plans/i })).toBeChecked();
    await expect(page.getByLabel('Free AI actions / month')).toHaveValue(/\d+/, { timeout: 15000 });
    await expect(page.getByTestId('user-access').first()).toBeVisible({ timeout: 15000 });
  });
});
