import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { notifyAdmin } from '../_shared/notifyAdmin.ts';

// Called by the notify_new_signup() database trigger via pg_net when a profile
// is created. Deploy with --no-verify-jwt; requests are authenticated by the
// x-notify-secret header, which must match the NOTIFY_WEBHOOK_SECRET secret.
Deno.serve(async (req: Request) => {
  const expected = Deno.env.get('NOTIFY_WEBHOOK_SECRET');
  if (!expected || req.headers.get('x-notify-secret') !== expected) {
    return new Response('Unauthorized', { status: 401 });
  }

  const { user_id } = await req.json().catch(() => ({}));
  if (!user_id) return new Response('Missing user_id', { status: 400 });

  const { data } = await getServiceClient().auth.admin.getUserById(user_id);
  const u = data?.user;
  const provider = u?.app_metadata?.provider || 'email';
  await notifyAdmin(
    `New Raphyzone signup: ${u?.email ?? user_id}`,
    [`Email: ${u?.email ?? 'unknown'}`, `Provider: ${provider}`, `User id: ${user_id}`, `At: ${u?.created_at ?? new Date().toISOString()}`].join('\n'),
  );
  return Response.json({ ok: true });
});
