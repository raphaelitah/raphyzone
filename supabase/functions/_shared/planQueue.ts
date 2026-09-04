import { runPlanGeneration } from './generatePlan.ts';

// Groq's ~8,000 TPM budget and a ~3-4k-token cost per plan generation (merged
// call + verifyWorkoutReasons) means two generations back-to-back risk
// colliding within the same rolling minute. 25s between claims keeps every
// job's cost comfortably inside its own window with headroom left for
// swapWorkout/suggestExerciseSubstitutes calls happening at the same time.
const PACING_SECONDS = 25;

// Claims and runs the oldest queued job, if the pacing guard (see
// claim_next_plan_job in migrations) allows it right now. Called both from
// generateWeeklyPlan (so the common no-contention case still resolves
// synchronously) and from pollPlanJob (so the queue drains as long as anyone
// is actively waiting on a result). Returns the claimed job's id, or null if
// nothing was claimed (queue empty, or pacing guard said "too soon").
export async function claimAndRunNextJob(supabase: any): Promise<string | null> {
  const { data: job, error } = await supabase.rpc('claim_next_plan_job', { pacing_seconds: PACING_SECONDS });
  if (error) {
    console.error('claim_next_plan_job failed:', error.message);
    return null;
  }
  if (!job) return null;

  try {
    const { plan, summary } = await runPlanGeneration(supabase, { id: job.user_id }, job.request);
    await supabase.from('plan_generation_jobs').update({
      status: 'done',
      result: { plan, summary },
      finished_at: new Date().toISOString(),
    }).eq('id', job.id);
    await maybeSendReadyEmail(job, 'done');
  } catch (err) {
    await supabase.from('plan_generation_jobs').update({
      status: 'failed',
      error: (err as Error).message,
      finished_at: new Date().toISOString(),
    }).eq('id', job.id);
    await maybeSendReadyEmail(job, 'failed');
  }
  return job.id;
}

// Opt-in notification for athletes who added their email while waiting.
// Requires RESEND_API_KEY — same "skip if not configured" pattern as the LLM
// providers in llm.ts, so the queue itself never depends on an email provider
// being set up; without a key this just logs and does nothing.
async function maybeSendReadyEmail(job: any, outcome: 'done' | 'failed') {
  if (!job.notify_email) return;
  const apiKey = Deno.env.get('RESEND_API_KEY');
  if (!apiKey) {
    console.log(`Would email ${job.notify_email} for job ${job.id} (${outcome}) but RESEND_API_KEY is not set — skipping.`);
    return;
  }

  const subject = outcome === 'done' ? 'Your weekly plan is ready' : 'We could not build your weekly plan';
  const text = outcome === 'done'
    ? 'Your weekly training plan has finished generating — open RaphyZone to review it.'
    : 'Something went wrong generating your weekly plan. Please try again in the app.';

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: Deno.env.get('RESEND_FROM_EMAIL') || 'RaphyZone <onboarding@resend.dev>',
        to: job.notify_email,
        subject,
        text,
      }),
    });
    if (!res.ok) console.error('Resend email failed:', res.status, await res.text().catch(() => ''));
  } catch (err) {
    console.error('Resend email request failed:', (err as Error).message);
  }
}
