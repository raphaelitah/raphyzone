import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { claimAndRunNextJob } from '../_shared/planQueue.ts';

// Polled by the frontend (every few seconds) while a plan generation is
// queued. Doubles as the queue's worker: if the job being polled is still
// queued, this opportunistically tries to claim and run the oldest queued job
// (subject to the pacing guard in planQueue.ts) before reporting status. That
// means the queue only advances while at least one client is actively
// waiting — there's no separate always-on worker process — but since the
// person waiting is exactly who benefits from the queue moving, this works
// out: every waiting client's poll nudges the front of the line forward.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const jobId = body.job_id;
    if (!jobId) return Response.json({ error: 'job_id required' }, { status: 400, headers: corsHeaders });

    const supabase = getServiceClient();

    const { data: job, error } = await supabase.from('plan_generation_jobs').select('*').eq('id', jobId).single();
    if (error || !job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
    if (job.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });

    if (job.status === 'queued') {
      await claimAndRunNextJob(supabase);
    }

    const { data: fresh } = await supabase.from('plan_generation_jobs').select('*').eq('id', jobId).single();
    if (!fresh) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });

    if (fresh.status === 'done') return Response.json({ status: 'done', ...fresh.result }, { headers: corsHeaders });
    if (fresh.status === 'failed') return Response.json({ status: 'failed', error: fresh.error }, { headers: corsHeaders });

    // How many still-queued jobs are ahead of this one, for a "you're 3rd in
    // line" style message rather than a bare spinner.
    const { count } = await supabase
      .from('plan_generation_jobs')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lt('created_at', fresh.created_at);

    return Response.json({ status: fresh.status, position: (count || 0) + 1 }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
