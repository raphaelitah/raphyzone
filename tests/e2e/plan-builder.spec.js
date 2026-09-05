import { test, expect } from '@playwright/test';
import { login, ATHLETE } from './fixtures/auth';
import { makeApiClient, currentWeekStartISO } from './fixtures/apiClient';

// Plan generation calls a real LLM-backed edge function, which can take a while —
// particularly under the shared Groq free-tier rate limit, where the backend now
// waits out and retries a 429 rather than failing fast (see supabase/functions/
// _shared/llm.ts), so a single generation can legitimately take over a minute.
test.describe.configure({ timeout: 180000 });

// Tagged so CI can exclude it from the on-push run: Gemini's free tier caps
// this project at 20 requests/day shared across all consumers (local dev, CI,
// pollPlanJob's background draining), and this spec alone burns several per
// run — see .github/workflows/ci.yml, which only runs @llm-quota specs on a
// manual workflow_dispatch.
test.describe('Weekly plan builder (regression) @llm-quota', () => {
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

    // Generation moves through several transient loading phases (e.g. "building
    // your week", "cross-checking exercise history") too quickly to reliably
    // assert on any one of them, so just wait for completion. Generation hits a
    // real LLM edge function — give it a generous window. Completion lands on
    // one of two phases depending on the athlete's "auto-approve plans" setting:
    // a review screen with an "Approve plan" button, or an auto-approved
    // confirmation that redirects to Home on its own after a few seconds.
    const approveButton = page.getByRole('button', { name: /approve plan/i });
    const autoApprovedHeading = page.getByText(/plan auto-approved/i);
    await expect(approveButton.or(autoApprovedHeading)).toBeVisible({ timeout: 150000 });

    if (await approveButton.isVisible()) {
      // Seven days of the week should be laid out (train/rest/activity slots).
      const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
      for (const day of days) {
        await expect(page.getByText(new RegExp(`^${day} ·`)).first()).toBeVisible();
      }
      await approveButton.click();
    }

    await page.waitForURL('/', { timeout: 10000 });
  });
});
