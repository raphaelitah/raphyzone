import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

test.describe('Core navigation (regression)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  const tabs = [
    { name: 'Home', path: '/' },
    { name: 'Workouts', path: '/workouts' },
    { name: 'Progress', path: '/progress' },
    { name: 'Exercises', path: '/library' },
    { name: 'Profile', path: '/profile' },
  ];

  for (const tab of tabs) {
    test(`bottom nav loads ${tab.name}`, async ({ page }) => {
      await page.goto('/');
      await page.getByRole('link', { name: tab.name }).click();
      await expect(page).toHaveURL(new RegExp(`${tab.path === '/' ? '/$' : tab.path}`));
      // Page rendered without an unhandled error boundary / blank screen.
      await expect(page.locator('body')).not.toContainText(/unexpected error|something went wrong/i);
    });
  }
});
