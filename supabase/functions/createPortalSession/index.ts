import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { appOrigin, getStripe } from '../_shared/stripe.ts';

// Opens the Stripe Customer Portal (update card, switch plan, cancel, invoices)
// for the signed-in user -> `{ url }`.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const supabase = getServiceClient();
    const { data: ent } = await supabase.from('user_entitlements').select('stripe_customer_id').eq('user_id', user.id).maybeSingle();
    if (!ent?.stripe_customer_id) return Response.json({ error: 'No billing account yet' }, { status: 404, headers: corsHeaders });

    const session = await getStripe().billingPortal.sessions.create({
      customer: ent.stripe_customer_id,
      return_url: `${appOrigin(req)}/profile`,
    });
    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
