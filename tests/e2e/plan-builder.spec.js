import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient, currentWeekStartISO } from './fixtures/apiClient';

// Plan generation calls a real LLM-backed edge function, which can take a while.
test.describe.configure({ timeout: 90000 });

test.describe('Weekly plan builder (regression)', () => {
  test.beforeEach(async ({ page }) => {
    // Start from a clean slate so we exercise the full generation flow rather than
    // resuming an already-generated plan for this week.
    const api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    await api.from('weekly_plans').delete().eq('user_id', signInData.user.id).eq('week_start_date', currentWeekStartISO());

    await login(page);
  });

  test('generates a weekly plan end to end', async ({ page }) => {
    await page.goto('/plan');

    await expect(page.getByRole('heading', { name: /is next week a normal week/i })).toBeVisible();
    await page.getByText('Normal week', { exact: true }).click();
    await page.getByRole('button', { name: /generate my week/i }).click();

    await expect(page.getByText(/building your week/i)).toBeVisible();
    // Generation hits a real LLM edge function — give it a generous window.
    await expect(page.getByRole('button', { name: /done/i })).toBeVisible({ timeout: 60000 });

    // Seven days of the week should be laid out (train/rest/activity slots).
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    for (const day of days) {
      await expect(page.getByText(new RegExp(`^${day} ·`)).first()).toBeVisible();
    }
  });
});
