import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

test.describe('Terms and Privacy', () => {
  test('terms page is public and shows the operator, governing law and contact', async ({ page }) => {
    await page.goto('/terms');
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
    await expect(page.getByText('Roberts, Bryant & Iverson').first()).toBeVisible();
    await expect(page.getByText(/Delaware/).first()).toBeVisible();
    await expect(page.getByRole('link', { name: 'info@rbi-consulting.com' })).toBeVisible();
    // Prices come from the same constants as the upgrade sheet.
    await expect(page.getByText(/currently €9\.99 per month/)).toBeVisible();
  });

  test('privacy page is public and names the data processors', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.getByRole('heading', { name: 'Privacy Policy' })).toBeVisible();
    for (const name of ['Supabase', 'Stripe', 'Groq']) {
      await expect(page.getByText(name, { exact: false }).first()).toBeVisible();
    }
    await expect(page.getByRole('link', { name: 'info@rbi-consulting.com' }).first()).toBeVisible();
  });

  test('sign-up asks for agreement and links to both pages', async ({ page }) => {
    await page.goto('/register');
    const consent = page.getByTestId('legal-consent');
    await expect(consent).toContainText('you agree to our');
    await expect(consent.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', '/terms');
    await expect(consent.getByRole('link', { name: 'Privacy Policy' })).toHaveAttribute('href', '/privacy');
  });

  test('signed-in users find the links on Profile', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    await page.getByRole('link', { name: 'Terms of Service' }).click();
    await expect(page.getByRole('heading', { name: 'Terms of Service' })).toBeVisible();
  });
});

test.describe('Delete account', () => {
  test('requires typing the account email before the delete button enables', async ({ page }) => {
    await login(page);
    await page.goto('/profile');
    await page.getByRole('button', { name: 'Delete account' }).click();
    const dialog = page.getByRole('dialog');
    const confirm = dialog.getByRole('button', { name: 'Delete my account' });
    await expect(dialog.getByText('This cannot be undone', { exact: false }).or(dialog.getByText('cannot be undone'))).toBeVisible();
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/type your email/i).fill('someone-else@example.com');
    await expect(confirm).toBeDisabled();
    await dialog.getByLabel(/type your email/i).fill('test-athlete@raphyzone.dev');
    await expect(confirm).toBeEnabled();
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('Sign-up attribution', () => {
  test('UTM params on first visit are stored for the sign-up flow', async ({ page }) => {
    await page.goto('/register?utm_source=instagram&utm_medium=bio&utm_campaign=test');
    const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('rz_attribution') || 'null'));
    expect(stored).toMatchObject({ utm_source: 'instagram', utm_medium: 'bio', utm_campaign: 'test' });
    // First touch wins: a later visit with different UTMs must not overwrite it.
    await page.goto('/login?utm_source=other');
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('rz_attribution')));
    expect(after.utm_source).toBe('instagram');
  });
});

test('captured attribution is saved to the account on sign-in', async ({ page }) => {
  await page.goto('/register?utm_source=instagram&utm_medium=bio&utm_campaign=e2e');
  await login(page);
  // flushAttribution clears the stored copy only after the RPC succeeded.
  await expect.poll(() => page.evaluate(() => localStorage.getItem('rz_attribution'))).toBeNull();
});
