import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

test.describe('Workout library (regression)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/workouts');
  });

  test('lists approved workouts', async ({ page }) => {
    const cards = page.locator('button:has(p.font-semibold)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
  });

  test('opens workout detail sheet with structure', async ({ page }) => {
    const cards = page.locator('button:has(p.font-semibold)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const name = await cards.first().locator('p.font-semibold').innerText();
    await cards.first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
    await expect(sheet.getByRole('link', { name: /start workout/i })).toBeVisible();
  });

  test('search filters the list', async ({ page }) => {
    const searchInput = page.getByPlaceholder(/search workouts/i);
    await expect(page.locator('button:has(p.font-semibold)').first()).toBeVisible({ timeout: 10000 });
    await searchInput.fill('zzzzzz-no-such-workout-zzzzzz');
    await expect(page.getByText('No workouts found.')).toBeVisible();
  });
});
