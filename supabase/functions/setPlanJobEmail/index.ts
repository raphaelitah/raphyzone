import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Attaches a notification email to a still-in-flight plan generation job —
// the "let me know by email" fallback offered once a queued job has been
// waiting a while. Actually sending the email happens in planQueue.ts when
// the job finishes; this just records where to send it, after checking the
// job belongs to the caller and hasn't already finished.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { job_id, email } = body;
    if (!job_id || !email) return Response.json({ error: 'job_id and email required' }, { status: 400, headers: corsHeaders });
    if (!EMAIL_RE.test(email)) return Response.json({ error: 'Invalid email address' }, { status: 400, headers: corsHeaders });

    const supabase = getServiceClient();
    const { data: job, error } = await supabase.from('plan_generation_jobs').select('id, user_id, status').eq('id', job_id).single();
    if (error || !job) return Response.json({ error: 'Job not found' }, { status: 404, headers: corsHeaders });
    if (job.user_id !== user.id) return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });
    if (job.status !== 'queued' && job.status !== 'processing') {
      return Response.json({ error: 'This plan has already finished generating' }, { status: 400, headers: corsHeaders });
    }

    const { error: updateError } = await supabase.from('plan_generation_jobs').update({ notify_email: email }).eq('id', job_id);
    if (updateError) throw new Error(updateError.message);

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
