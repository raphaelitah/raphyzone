import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { appOrigin, getStripe, priceIdFor } from '../_shared/stripe.ts';
import { isLiveSubscriptionStatus } from '../_shared/subscriptionState.ts';

// Starts a Stripe Checkout subscription for the signed-in user:
// `{ interval: 'month' | 'year' }` -> `{ url }` to redirect the browser to.
// The subscription itself only unlocks premium once stripeWebhook confirms it.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const { interval } = await req.json();
    const price = priceIdFor(interval);
    if (!price) return Response.json({ error: 'Unknown or unconfigured plan' }, { status: 400, headers: corsHeaders });

    const supabase = getServiceClient();
    const stripe = getStripe();
    const { data: ent } = await supabase
      .from('user_entitlements')
      .select('stripe_customer_id, subscription_status')
      .eq('user_id', user.id)
      .maybeSingle();

    if (isLiveSubscriptionStatus(ent?.subscription_status)) {
      return Response.json({ error: 'already_subscribed' }, { status: 409, headers: corsHeaders });
    }

    let customerId = ent?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({ email: user.email, metadata: { user_id: user.id } });
      customerId = customer.id;
      const { error } = await supabase
        .from('user_entitlements')
        .upsert({ user_id: user.id, stripe_customer_id: customerId, updated_date: new Date().toISOString() }, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
    }

    const origin = appOrigin(req);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: user.id } },
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    return Response.json({ url: session.url }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
