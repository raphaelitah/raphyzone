import { test, expect } from '@playwright/test';
import { login, ADMIN } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

test.describe('Admin taxonomy management (regression)', () => {
  test('non-admin is redirected away from admin taxonomy', async ({ page }) => {
    await login(page); // athlete
    await page.goto('/admin-taxonomy');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test.describe('as admin', () => {
    test.beforeEach(async ({ page }) => {
      await login(page, ADMIN);
      await page.goto('/admin-taxonomy');
    });

    test('loads with a dimension selector and terms', async ({ page }) => {
      await expect(page.getByRole('heading', { name: 'Taxonomy Management' })).toBeVisible();
      await expect(page.getByRole('combobox')).toBeVisible();
    });

    test('adds, edits, and deletes a term', async ({ page }) => {
      const termName = `e2e-term-${Date.now()}`;
      const renamedTerm = `${termName}-renamed`;

      // Equipment is the default dimension, which requires a type/group selection.
      await page.getByRole('button', { name: 'Add' }).click();
      const sheet = page.getByRole('dialog');
      await sheet.getByRole('combobox').click();
      await page.getByRole('option').first().click();
      await sheet.getByPlaceholder('Machine name…').fill(termName);
      await sheet.getByRole('button', { name: 'Add' }).click();

      const termRow = page.locator('div.rounded-xl.border', { hasText: termName });
      await expect(termRow).toBeVisible({ timeout: 10000 });

      // Edit: rename the term. The row switches into edit mode; the value input is
      // autofocused, so once the term's text leaves the DOM (replaced by the input)
      // we locate via focus rather than re-matching on text.
      await termRow.getByRole('button').first().click(); // pencil icon
      const editValueInput = page.locator('input:focus');
      await editValueInput.fill(renamedTerm);
      await editValueInput.locator('xpath=..').getByRole('button').first().click(); // check icon confirms the save

      const renamedRow = page.locator('div.rounded-xl.border', { hasText: renamedTerm });
      await expect(renamedRow).toBeVisible({ timeout: 10000 });

      // Delete: unused term deletes immediately with no transfer step required.
      await renamedRow.getByRole('button').last().click(); // trash icon
      await expect(page.getByText(`Delete "${renamedTerm}"?`)).toBeVisible();
      await expect(page.getByText('This term is not used by any exercises.')).toBeVisible();
      await page.getByRole('button', { name: 'Delete' }).click();

      await expect(page.locator('div.rounded-xl.border', { hasText: renamedTerm })).toHaveCount(0);

      // Safety net in case the UI assertions above ever leave the term behind.
      const api = makeApiClient();
      await api.auth.signInWithPassword(ADMIN);
      await api.from('taxonomy_terms').delete().in('value', [termName, renamedTerm]);
    });
  });
});
