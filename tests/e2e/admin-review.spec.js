import { test, expect } from '@playwright/test';
import { login, ADMIN } from './fixtures/auth';
import { seedPendingExercise, seedPendingWorkout, cleanupReviewItem } from './fixtures/reviewSeed';

test.describe('Admin UGC review (regression)', () => {
  test('non-admin is redirected away from admin review', async ({ page }) => {
    await login(page); // athlete
    await page.goto('/admin-review');
    await page.waitForURL((url) => url.pathname === '/', { timeout: 10000 });
  });

  test('approves a pending exercise submission', async ({ page }) => {
    const exercise = await seedPendingExercise();
    try {
      await login(page, ADMIN);
      await page.goto('/admin-review');

      const card = page.locator('div.rounded-2xl.border-border', { hasText: exercise.name });
      await expect(card.getByRole('button', { name: /approve/i })).toBeVisible({ timeout: 10000 });
      await card.getByRole('button', { name: /approve/i }).click();

      await expect(page.locator('div.rounded-2xl.border-border', { hasText: exercise.name })).toHaveCount(0, { timeout: 10000 });
    } finally {
      await cleanupReviewItem('exercises', exercise.id);
    }
  });

  test('rejects a pending exercise submission with a reason', async ({ page }) => {
    const exercise = await seedPendingExercise();
    try {
      await login(page, ADMIN);
      await page.goto('/admin-review');

      const card = page.locator('div.rounded-2xl.border-border', { hasText: exercise.name });
      await expect(card.getByRole('button', { name: /^reject$/i })).toBeVisible({ timeout: 10000 });
      await card.getByRole('button', { name: /^reject$/i }).click();
      await card.getByPlaceholder(/reason for rejection/i).fill('E2E rejection reason');
      await card.getByRole('button', { name: /confirm reject/i }).click();

      await expect(page.locator('div.rounded-2xl.border-border', { hasText: exercise.name })).toHaveCount(0, { timeout: 10000 });
    } finally {
      await cleanupReviewItem('exercises', exercise.id);
    }
  });

  test('approves a pending workout submission', async ({ page }) => {
    const workout = await seedPendingWorkout();
    try {
      await login(page, ADMIN);
      await page.goto('/admin-review');
      await page.getByRole('button', { name: /^workouts/i }).click();

      const card = page.locator('div.rounded-2xl.border-border', { hasText: workout.name });
      await expect(card.getByRole('button', { name: /approve/i })).toBeVisible({ timeout: 10000 });
      await card.getByRole('button', { name: /approve/i }).click();

      await expect(page.locator('div.rounded-2xl.border-border', { hasText: workout.name })).toHaveCount(0, { timeout: 10000 });
    } finally {
      await cleanupReviewItem('workouts', workout.id);
    }
  });
});
