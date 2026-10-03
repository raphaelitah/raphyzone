import { test, expect } from '@playwright/test';
import { login, ADMIN } from './fixtures/auth';

test.describe('Admin LLM health', () => {
  test('non-admin is redirected away', async ({ page }) => {
    await login(page);
    await page.goto('/admin-alerts');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('admin sees Groq and all four Gemini keys', async ({ page }) => {
    await login(page, ADMIN);
    await page.goto('/admin-alerts');
    await expect(page.getByRole('heading', { name: 'LLM Health' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Providers' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'By function' })).toBeVisible();
    for (const name of ['Groq', 'Gemini 1', 'Gemini 2', 'Gemini 3', 'Gemini 4']) {
      await expect(page.getByText(name, { exact: true })).toBeVisible();
    }
  });
});
