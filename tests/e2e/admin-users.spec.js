import { test, expect } from '@playwright/test';
import { login, ADMIN } from './fixtures/auth';

test.describe('Admin users', () => {
  test('non-admin is redirected away from admin users', async ({ page }) => {
    await login(page); // athlete
    await page.goto('/admin-users');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('admin sees users with last login and workout counts, and an invite form', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin-users');
    await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
    await expect(page.getByLabel('Invite email')).toBeVisible();
    await expect(page.getByTestId('user-row').first()).toBeVisible({ timeout: 15000 });
    await expect(page.getByText(/Last login:/).first()).toBeVisible();
    await expect(page.getByText('workouts').first()).toBeVisible();
  });
});
