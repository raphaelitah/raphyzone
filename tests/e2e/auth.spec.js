import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

test.describe('Authentication', () => {
  test('shows validation error on bad login', async ({ page }) => {
    await page.goto('/login');
    await page.getByLabel(/email/i).fill('nonexistent@example.com');
    await page.getByLabel(/password/i).fill('wrong-password-123');
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page.getByText(/invalid|error/i)).toBeVisible({ timeout: 10000 });
  });

  test('unauthenticated user visiting a protected route is redirected to login', async ({ page }) => {
    await page.goto('/workouts');
    await page.waitForURL(/\/login/, { timeout: 10000 });
  });

  test('logs in with valid credentials', async ({ page }) => {
    await login(page);
    await expect(page).not.toHaveURL(/\/login/);
  });
});
