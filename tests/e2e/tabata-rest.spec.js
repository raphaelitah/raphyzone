import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';
import { seedTabataWorkout, cleanupTabataWorkout } from './fixtures/tabataSeed';

// Regression coverage for the inter-block rest fix: rest between two Tabata
// blocks used to only start once the athlete dismissed the "block complete"
// log/tracking screen, so logging performance ate into it for free instead
// of the rest running underneath. It should now run on wall-clock time from
// the moment the block finishes, tick down through the log screen, and
// continue (not restart) once the athlete lands on the next block — which
// should stay fully usable underneath the rest banner rather than being
// blocked, with an early "Start" prompting a confirm instead of silently
// skipping the rest.
test.describe('Inter-block rest between Tabata blocks', () => {
  let seeded;

  test.beforeEach(async () => {
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    await api.from('workout_sessions').delete().eq('user_id', signInData.user.id).eq('status', 'in_progress');
    seeded = await seedTabataWorkout(15);
  });

  test.afterEach(async () => {
    if (seeded) await cleanupTabataWorkout(seeded);
  });

  test('rest keeps running through the log screen and overlays (not blocks) the next block', async ({ page }) => {
    await login(page);
    await page.goto(`/workout/${seeded.workoutUuid}`);

    // Block 1: start the Tabata (1s work, 1s rest, 1 round, plus the fixed
    // 10s lead-in) and wait for it to finish into the log/tracking screen.
    await page.getByRole('button', { name: /^start tabata/i }).click();
    await expect(page.getByRole('heading', { name: /tabata complete/i })).toBeVisible({ timeout: 20000 });

    // The rest banner should be visible and actually ticking down while the
    // athlete is on this log screen — not frozen/absent.
    const restRow = page.getByText(/rest before next block/i).locator('..');
    await expect(restRow).toBeVisible();
    const restClock = restRow.getByText(/^\d{2}:\d{2}$/);
    const firstReading = await restClock.textContent();
    await page.waitForTimeout(2500);
    const secondReading = await restClock.textContent();
    expect(secondReading).not.toBe(firstReading);

    // Save the log and land on block 2 — the rest should still be running
    // (continuing the same countdown, not restarting at 15s) and the next
    // block's own start panel should be visible underneath it, not replaced
    // by a blocking "resting" screen.
    await page.getByRole('button', { name: /save.*continue/i }).click();
    await expect(page.getByText(/^resting$/i)).toBeVisible({ timeout: 10000 });
    const startTabataButton = page.getByRole('button', { name: /^start tabata/i });
    await expect(startTabataButton).toBeVisible();

    // Starting the next block early (while still resting) should prompt a
    // confirmation instead of silently starting or silently skipping rest.
    await startTabataButton.click();
    await expect(page.getByRole('alertdialog').getByText(/still resting/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /keep resting/i }).click();
    await expect(page.getByRole('alertdialog')).toBeHidden();
    // Declining the early start must not have armed the timer.
    await expect(startTabataButton).toBeVisible();

    // Confirming the early start should clear the rest and arm block 2.
    await startTabataButton.click();
    await expect(page.getByRole('alertdialog').getByText(/still resting/i)).toBeVisible({ timeout: 5000 });
    await page.getByRole('button', { name: /^start now$/i }).click();
    await expect(page.getByText(/^resting$/i)).toBeHidden();
    await expect(page.getByText(/get ready|^work$/i)).toBeVisible({ timeout: 5000 });
  });
});
