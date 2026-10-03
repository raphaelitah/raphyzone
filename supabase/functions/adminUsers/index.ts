import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PER_PAGE = 1000;

// Admin-only user management: `{ action: 'list' }` returns every user with
// their last sign-in, completed-workout count and premium/trial status;
// `{ action: 'invite', email }` sends a Supabase invite email;
// `{ action: 'set_access', user_id, ... }` grants premium or extends a trial. Both need the service role (auth.users is not
// readable from the browser), so the caller's admin role is checked first.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const supabase = getServiceClient();
    const { data: caller } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (caller?.role !== 'admin') return Response.json({ error: 'Forbidden' }, { status: 403, headers: corsHeaders });

    const { action, email, redirectTo, user_id, premium_override, extend_trial_days } = await req.json();

    // Grants/revokes premium access for one user: `premium_override` toggles a
    // permanent admin grant; `extend_trial_days` pushes the trial end that many
    // days past now (or past its current end if it is still running).
    if (action === 'set_access') {
      if (!user_id) return Response.json({ error: 'user_id required' }, { status: 400, headers: corsHeaders });
      const { data: current } = await supabase.from('user_entitlements').select('trial_ends_at').eq('user_id', user_id).maybeSingle();
      const patch: Record<string, unknown> = { user_id, updated_date: new Date().toISOString() };
      if (typeof premium_override === 'boolean') patch.premium_override = premium_override;
      if (Number.isFinite(extend_trial_days) && extend_trial_days > 0) {
        const base = Math.max(Date.now(), current?.trial_ends_at ? new Date(current.trial_ends_at).getTime() : 0);
        patch.trial_ends_at = new Date(base + extend_trial_days * 86400000).toISOString();
      }
      const { error } = await supabase.from('user_entitlements').upsert(patch, { onConflict: 'user_id' });
      if (error) return Response.json({ error: error.message }, { status: 400, headers: corsHeaders });
      return Response.json({ ok: true }, { headers: corsHeaders });
    }

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

      const [{ data: profiles, error: pErr }, { data: sessions, error: sErr }, { data: ents, error: eErr }] = await Promise.all([
        supabase.from('profiles').select('id, role, last_active_at'),
        supabase.from('workout_sessions').select('user_id').eq('status', 'completed').limit(100000),
        supabase.from('user_entitlements').select('user_id, trial_ends_at, premium_override, premium_until'),
      ]);
      if (eErr) throw new Error(eErr.message);
      const entitlements = new Map((ents || []).map((e: any) => [e.user_id, e]));
      if (pErr) throw new Error(pErr.message);
      if (sErr) throw new Error(sErr.message);

      const lastActive = new Map((profiles || []).map((p: any) => [p.id, p.last_active_at]));
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
        last_active_at: [lastActive.get(u.id), u.last_sign_in_at].filter(Boolean).sort().pop() || null,
        invited_at: u.invited_at || null,
        confirmed: !!(u.email_confirmed_at || u.confirmed_at),
        completed_workouts: counts.get(u.id) || 0,
        trial_ends_at: entitlements.get(u.id)?.trial_ends_at || null,
        premium_override: !!entitlements.get(u.id)?.premium_override,
        premium_until: entitlements.get(u.id)?.premium_until || null,
      }));
      return Response.json({ users }, { headers: corsHeaders });
    }

    return Response.json({ error: 'Unknown action' }, { status: 400, headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
