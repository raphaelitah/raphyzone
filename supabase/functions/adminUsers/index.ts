import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_PAGE = 1000;

// Admin-only user management: `{ action: 'list' }` returns every user with
// their last sign-in and completed-workout count; `{ action: 'invite', email }`
// sends a Supabase invite email. Both need the service role (auth.users is not
// readable from the browser), so the caller's admin role is checked first.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const supabase = getServiceClient();
    const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (caller?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });

    const { action, email, redirectTo } = await req.json();

    if (action === 'invite') {
      const address = String(email || '').trim().toLowerCase();
      if (!EMAIL_RE.test(address)) return Response.json({ error: 'Invalid email address' }, { status: 400, headers: corsHeaders });
      const { error } = await supabase.auth.admin.inviteUserByEmail(address, redirectTo ? { redirectTo } : undefined);
      if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

    if (action === 'list') {
      const authUsers = [];
      for (let page = 1; ; page++) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: PER_PAGE });
        if (error) throw new Error(error.message);
        authUsers.push(...data.users);
        if (data.users.length < PER_PAGE) break;
      }

      const [{ data: profiles, error: pErr }, { data: sessions, error: sErr }] = await Promise.all([
        supabase.from('profiles').select('id, role'),
        supabase.from('workout_sessions').select('user_id').eq('status', 'completed').limit(100000),
      ]);
      if (pErr) throw new Error(pErr.message);
      if (sErr) throw new Error(sErr.message);

      const roles = new Map((profiles || []).map((p) => [p.id, p.role]));
      const counts = new Map<string, number>();
      for (const s of sessions || []) counts.set(s.user_id, (counts.get(s.user_id) || 0) + 1);

      const users = authUsers.map((u) => ({
        id: u.id,
        email: u.email,
        full_name: u.user_metadata?.full_name || null,
        role: roles.get(u.id) || 'athlete',
        created_at: u.created_at,
        last_sign_in_at: u.last_sign_in_at || null,
        invited_at: u.invited_at || null,
        confirmed: !!(u.email_confirmed_at || u.confirmed_at),
        completed_workouts: counts.get(u.id) || 0,
      }));
      return Response.json({ users }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
