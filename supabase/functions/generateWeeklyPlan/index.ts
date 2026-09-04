import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { claimAndRunNextJob } from '../_shared/planQueue.ts';

// Queued weekly-plan generation: Groq's free tier meters tokens/minute, not
// requests/minute, so concurrent "build my week" clicks are paced through
// plan_generation_jobs instead of racing the same budget and 429ing each
// other. This endpoint enqueues a job, then immediately tries to claim and
// run it itself — in the common case (nothing else mid-generation) that
// succeeds and this returns { plan, summary } synchronously, identical to
// before the queue existed. It only returns { queued: true, job_id } when the
// pacing guard blocks an immediate claim (another job started too recently),
// in which case the frontend polls pollPlanJob — which both reports status
// AND drains the queue, so progress only requires someone actively waiting.
// See _shared/planQueue.ts for the pacing guard and _shared/generatePlan.ts
// for the actual generation logic (shared with pollPlanJob).
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    if (!body.week_start_date) return Response.json({ error: 'week_start_date required' }, { status: 400, headers: corsHeaders });

    const supabase = getServiceClient();

    const { data: job, error: insertError } = await supabase.from('plan_generation_jobs').insert({
      user_id: user.id,
      week_start_date: body.week_start_date,
      request: body,
    }).select().single();
    if (insertError) throw new Error(`Failed to queue plan generation: ${insertError.message}`);

    const claimedJobId = await claimAndRunNextJob(supabase);
    if (claimedJobId === job.id) {
      const { data: finished } = await supabase.from('plan_generation_jobs').select('*').eq('id', job.id).single();
      if (finished?.status === 'done') return Response.json({ ...finished.result, job_id: job.id }, { headers: corsHeaders });
      if (finished?.status === 'failed') return Response.json({ error: finished.error, job_id: job.id }, { status: 500, headers: corsHeaders });
    }

    return Response.json({ queued: true, job_id: job.id }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
