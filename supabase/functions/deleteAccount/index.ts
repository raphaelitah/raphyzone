import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { getStripe } from '../_shared/stripe.ts';

// Permanently deletes the signed-in user's account and data:
// `{ confirm_email }` (must match the account's email) -> `{ ok: true }`.
// Order matters: the Stripe customer goes first (which also cancels any
// subscription) so a failure there stops the deletion instead of leaving
// someone still being billed for an account that no longer exists.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { confirm_email } = await req.json();
    if (String(confirm_email || '').trim().toLowerCase() !== (user.email || '').toLowerCase()) {
      return Response.json({ error: 'Type your account email to confirm' }, { status: 400, headers: corsHeaders });
    }

    const supabase = getServiceClient();

    // Never leave the app without an admin.
    const { data: me } = await supabase.from('profiles').select('role').eq('id', user.id).maybeSingle();
    if (me?.role === 'admin') {
      const { count } = await supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
      if ((count ?? 0) <= 1) {
        return Response.json({ error: 'You are the only admin. Make someone else an admin before deleting this account.' }, { status: 409, headers: corsHeaders });
      }
    }

    const { data: ent } = await supabase.from('user_entitlements').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (ent?.stripe_customer_id) {
      try {
        await getStripe().customers.del(ent.stripe_customer_id);
      } catch (err) {
        // A customer that no longer exists in Stripe is fine; anything else aborts.
        if ((err as { code?: string }).code !== 'resource_missing') {
          return Response.json({ error: `Could not cancel your subscription: ${(err as Error).message}` }, { status: 502, headers: corsHeaders });
        }
      }
    }

    const { error: cleanupError } = await supabase.rpc('delete_user_data', { p_user: user.id });
    if (cleanupError) throw new Error(cleanupError.message);

    const { error: deleteError } = await supabase.auth.admin.deleteUser(user.id);
    if (deleteError) throw new Error(deleteError.message);

    return Response.json({ ok: true }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
