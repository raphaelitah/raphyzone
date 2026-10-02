import { supabase } from '@/lib/supabaseClient';

// Supabase's functions client puts the function's JSON body in error.context.
async function errorBody(error) {
  try { return await error.context.json(); } catch { return { error: error.message }; }
}

export async function openBillingPortal() {
  const { data, error } = await supabase.functions.invoke('createPortalSession', { body: {} });
  if (error) throw new Error((await errorBody(error)).error || 'Could not open billing');
  window.location.assign(data.url);
}

// Redirects to Stripe Checkout. Someone who already has a live subscription
// is sent to the billing portal instead of being charged twice.
export async function startCheckout(interval) {
  const { data, error } = await supabase.functions.invoke('createCheckoutSession', { body: { interval } });
  if (error) {
    const body = await errorBody(error);
    if (body.error === 'already_subscribed') return openBillingPortal();
    throw new Error(body.error || 'Could not start checkout');
  }
  window.location.assign(data.url);
}
