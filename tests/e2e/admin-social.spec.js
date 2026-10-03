import { test, expect } from '@playwright/test';
import { login, ADMIN } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

const WEEK = '2099-01-05';

async function adminApi() {
  const api = makeApiClient();
  const { error } = await api.auth.signInWithPassword(ADMIN);
  if (error) throw error;
  return api;
}

test.describe('Admin Instagram queue', () => {
  test('non-admin is redirected away', async ({ page }) => {
    await login(page);
    await page.goto('/admin-social');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('admin can approve, redo and kill drafts; unrendered posts cannot be approved', async ({ page }) => {
    const api = await adminApi();
    await api.from('social_posts').delete().eq('week_start', WEEK);
    const { error } = await api.from('social_posts').insert([
      { week_start: WEEK, slot: 1, kind: 'carousel_humour', hook: 'E2E rendered', caption: 'cap', scheduled_date: WEEK, render_status: 'rendered' },
      { week_start: WEEK, slot: 2, kind: 'single_split', hook: 'E2E unrendered', caption: 'cap', scheduled_date: WEEK, render_status: 'pending' },
      { week_start: WEEK, slot: 3, kind: 'reel_travel', hook: 'E2E redo', caption: 'cap', scheduled_date: WEEK, render_status: 'rendered' },
    ]);
    expect(error).toBeNull();
    try {
      await login(page, ADMIN);
      await page.goto('/admin-social');
      await page.getByLabel('Week').selectOption(WEEK);

      const rendered = page.getByTestId('social-post-1');
      await rendered.getByRole('button', { name: 'Approve' }).click();
      await expect(rendered.getByText('approved', { exact: true })).toBeVisible();

      await expect(page.getByTestId('social-post-2').getByRole('button', { name: 'Approve' })).toBeDisabled();

      page.once('dialog', (d) => d.accept('shorter hook'));
      await page.getByTestId('social-post-3').getByRole('button', { name: 'Redo' }).click();
      await expect(page.getByTestId('social-post-3').getByText('Redo note: shorter hook')).toBeVisible();

      await page.getByTestId('social-post-2').getByRole('button', { name: 'Kill' }).click();
      await expect(page.getByTestId('social-post-2').getByText('killed', { exact: true })).toBeVisible();

      const { data } = await api.from('social_posts').select('slot,status').eq('week_start', WEEK).order('slot');
      expect(data.map((r) => r.status)).toEqual(['approved', 'killed', 'redo']);
    } finally {
      await api.from('social_posts').delete().eq('week_start', WEEK);
    }
  });
});
