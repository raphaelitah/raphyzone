import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

test.describe('Exercise library (regression)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
    await page.goto('/library');
  });

  test('lists exercises', async ({ page }) => {
    await expect(page.getByRole('heading', { name: 'Exercises Library' })).toBeVisible();
    await expect(page.getByPlaceholder('Search exercises…')).toBeVisible();
    // At least one exercise card renders from the real library.
    await expect(page.locator('button:has(p.font-medium)').first()).toBeVisible({ timeout: 10000 });
  });

  test('search filters the list', async ({ page }) => {
    const cards = page.locator('button:has(p.font-medium)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const firstName = await cards.first().locator('p.font-medium').innerText();

    await page.getByPlaceholder('Search exercises…').fill(firstName);
    await expect(cards.first().locator('p.font-medium')).toHaveText(firstName);

    await page.getByPlaceholder('Search exercises…').fill('zzzzzz-no-such-exercise-zzzzzz');
    await expect(cards).toHaveCount(0);
  });

  test('opens exercise detail sheet', async ({ page }) => {
    const cards = page.locator('button:has(p.font-medium)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    const name = await cards.first().locator('p.font-medium').innerText();
    await cards.first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet.getByRole('heading', { name })).toBeVisible();
  });
});
