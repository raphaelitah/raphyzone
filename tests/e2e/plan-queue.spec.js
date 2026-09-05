import { test, expect } from '@playwright/test';
import { ATHLETE } from './fixtures/auth';
import { makeApiClient, currentWeekStartISO, addDaysISO } from './fixtures/apiClient';

// Exercises the generateWeeklyPlan queue (see supabase/functions/_shared/planQueue.ts)
// directly against the real backend, rather than through the UI: the pacing guard
// that triggers queueing is timing-sensitive (a 25s window), and firing two real
// generation requests back-to-back is the only way to reliably land one of them in
// the "queued" branch without a way to seed plan_generation_jobs directly (its RLS
// only allows SELECT for the owner — every write goes through the edge functions).
//
// Two distinct week_start_dates (next week and the week after) are used so this
// runs independently of plan-builder.spec.js's current-week plan.
test.describe.configure({ timeout: 180000 });

// See plan-builder.spec.js's @llm-quota tag comment — this spec also burns
// several real Gemini calls against the shared 20/day free-tier quota.
test.describe('Weekly plan generation queue (regression) @llm-quota', () => {
  let api;
  let weekA;
  let weekB;

  test.beforeEach(async () => {
    api = makeApiClient();
    const { data: signInData } = await api.auth.signInWithPassword(ATHLETE);
    weekA = addDaysISO(currentWeekStartISO(), 7);
    weekB = addDaysISO(currentWeekStartISO(), 14);
    await api.from('weekly_plans').delete().eq('user_id', signInData.user.id).in('week_start_date', [weekA, weekB]);
    // claim_next_plan_job claims the globally OLDEST queued job (see the migration),
    // not one scoped to this request — a stale 'queued' row left behind by a prior
    // (e.g. interrupted CI) run of this same spec gets claimed ahead of the jobs this
    // test just inserted, breaking the "exactly one immediate, one queued" assumption.
    // RLS only allows SELECT for the owner, so this can only clean up this user's own
    // leftovers, which is exactly the set that can interfere with this spec.
    await api.from('plan_generation_jobs').delete().eq('user_id', signInData.user.id).eq('status', 'queued');
  });

  test('a second concurrent generation queues and completes via polling', async () => {
    // The pacing guard's clock (see claim_next_plan_job / PACING_SECONDS in
    // planQueue.ts) is global across all users, not scoped to this test — if
    // plan-builder.spec.js's generation (which runs immediately before this file)
    // claimed a job recently enough, this test's first request would ALSO get
    // paced into the "queued" branch instead of running immediately, breaking the
    // "exactly one immediate, one queued" assumption below. Wait out the full
    // window first so this test controls its own pacing clock.
    await new Promise((resolve) => setTimeout(resolve, 26000));

    // Fired together (no await between) so both requests reach the pacing guard
    // within milliseconds of each other — the first to claim sets the pacing
    // clock, so the second reliably lands in the "queued" branch instead of a
    // race that could go either way if they were sequential.
    const [resA, resB] = await Promise.all([
      api.functions.invoke('generateWeeklyPlan', { body: { week_start_date: weekA, context_answer: 'normal', context_notes: '' } }),
      api.functions.invoke('generateWeeklyPlan', { body: { week_start_date: weekB, context_answer: 'normal', context_notes: '' } }),
    ]);

    expect(resA.error).toBeFalsy();
    expect(resB.error).toBeFalsy();

    const results = [resA.data, resB.data];
    const immediate = results.filter((r) => r?.plan);
    const queued = results.filter((r) => r?.queued);

    // Exactly one of the two should have run immediately (the one that won the
    // claim race) and the other should have been queued behind it.
    expect(immediate.length).toBe(1);
    expect(queued.length).toBe(1);
    expect(queued[0].job_id).toBeTruthy();

    // Poll pollPlanJob the same way the frontend does — each poll both reports
    // status and opportunistically drains the queue, so this should eventually
    // resolve without any other backstop worker running.
    let status;
    let plan;
    for (let attempt = 0; attempt < 20; attempt++) {
      const { data, error } = await api.functions.invoke('pollPlanJob', { body: { job_id: queued[0].job_id } });
      expect(error).toBeFalsy();
      status = data.status;
      if (status === 'done') { plan = data.plan; break; }
      if (status === 'failed') throw new Error(`Queued job failed: ${data.error}`);
      await new Promise((resolve) => setTimeout(resolve, 3000));
    }

    expect(status).toBe('done');
    expect(plan?.workouts?.length).toBe(7);
  });
});
