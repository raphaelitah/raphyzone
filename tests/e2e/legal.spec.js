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
