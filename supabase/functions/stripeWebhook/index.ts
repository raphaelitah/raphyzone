import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import Stripe from 'npm:stripe@17';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { getStripe } from '../_shared/stripe.ts';
import { entitlementFromSubscription } from '../_shared/subscriptionState.ts';

// Stripe -> app: keeps user_entitlements in step with the user's subscription.
// Deploy with --no-verify-jwt (Stripe does not send a Supabase JWT); requests
// are authenticated by the Stripe-Signature header instead.
//
// Rather than trust the event payload's snapshot (events can arrive out of
// order), every relevant event just identifies a subscription, which is then
// re-fetched from Stripe and written — so the last write is always current.
async function syncSubscription(stripe: Stripe, supabase: any, subscriptionId: string, userIdHint?: string | null) {
  const sub = await stripe.subscriptions.retrieve(subscriptionId);
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  let userId = userIdHint || (sub.metadata?.user_id as string | undefined) || null;
  if (!userId) {
    const { data } = await supabase.from('user_entitlements').select('user_id').eq('stripe_customer_id', customerId).maybeSingle();
    userId = data?.user_id || null;
  }
  if (!userId) {
    console.error(`stripeWebhook: no user for subscription ${sub.id} / customer ${customerId}`);
    return;
  }

  const { error } = await supabase.from('user_entitlements').upsert(
    {
      user_id: userId,
      stripe_customer_id: customerId,
      ...entitlementFromSubscription(sub as any),
      updated_date: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get('Stripe-Signature');
  const secret = Deno.env.get('STRIPE_WEBHOOK_SECRET');
  if (!signature || !secret) return new Response('Missing signature or secret', { status: 400 });

  const stripe = getStripe();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await req.text(), signature, secret, undefined, Stripe.createSubtleCryptoProvider());
  } catch (err) {
    return new Response(`Invalid signature: ${(err as Error).message}`, { status: 400 });
  }

  try {
    const supabase = getServiceClient();
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        if (session.mode === 'subscription' && session.subscription) {
          const subId = typeof session.subscription === 'string' ? session.subscription : session.subscription.id;
          await syncSubscription(stripe, supabase, subId, session.client_reference_id);
        }
        break;
      }
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(stripe, supabase, sub.id);
        break;
      }
      default:
        break;
    }
    return Response.json({ received: true });
  } catch (err) {
    // Non-2xx makes Stripe retry the event.
    console.error('stripeWebhook failed:', (err as Error).message);
    return new Response('Webhook handler failed', { status: 500 });
  }
});
