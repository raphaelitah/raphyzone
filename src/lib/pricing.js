// Display copy only — what Stripe actually charges is set by the prices behind
// the STRIPE_PRICE_MONTHLY / STRIPE_PRICE_ANNUAL edge function secrets. Keep
// these in sync with those prices.
export const PRICING = {
  currency: '€',
  month: { amount: '9.99', label: 'Monthly', cadence: '/month' },
  year: { amount: '79.99', label: 'Annual', cadence: '/year', perMonth: '6.67', savePct: 33 },
};
