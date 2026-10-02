import Stripe from 'npm:stripe@17';

// Stripe is configured entirely through Edge Function secrets:
//   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, STRIPE_PRICE_MONTHLY, STRIPE_PRICE_ANNUAL
export function getStripe() {
  const key = Deno.env.get('STRIPE_SECRET_KEY');
  if (!key) throw new Error('Stripe is not configured (STRIPE_SECRET_KEY missing)');
  return new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
}

export function priceIdFor(interval: string): string | null {
  const id = Deno.env.get(interval === 'year' ? 'STRIPE_PRICE_ANNUAL' : interval === 'month' ? 'STRIPE_PRICE_MONTHLY' : '');
  return id || null;
}

// Where Stripe sends the user back to. The browser's Origin header names the
// app that made the request (production or localhost); anything else falls
// back to APP_URL if set.
export function appOrigin(req: Request): string {
  const origin = req.headers.get('Origin');
  if (origin && /^https:\/\/|^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  const fallback = Deno.env.get('APP_URL');
  if (!fallback) throw new Error('Cannot determine the app URL (no Origin header and APP_URL not set)');
  return fallback.replace(/\/$/, '');
}
