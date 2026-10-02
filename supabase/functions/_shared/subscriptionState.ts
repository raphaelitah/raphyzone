// Pure mapping from a Stripe subscription to the user_entitlements columns it
// drives — no imports so it can be unit-tested without the Stripe SDK.

const DAY_S = 24 * 60 * 60;
// Card failures retry for a while (past_due); keep access during that window
// rather than locking someone out the day a card expires.
const PAST_DUE_GRACE_DAYS = 3;

export interface SubscriptionLike {
  id: string;
  status: string;
  cancel_at_period_end?: boolean;
  current_period_end?: number;
  ended_at?: number | null;
  items?: { data?: Array<{ current_period_end?: number; price?: { recurring?: { interval?: string } | null } }> };
}

export interface EntitlementPatch {
  stripe_subscription_id: string;
  subscription_status: string;
  plan_interval: 'month' | 'year' | null;
  cancel_at_period_end: boolean;
  premium_until: string | null;
}

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

export function entitlementFromSubscription(sub: SubscriptionLike, nowMs = Date.now()): EntitlementPatch {
  const item = sub.items?.data?.[0];
  // Newer Stripe API versions moved current_period_end onto the subscription item.
  const periodEnd = sub.current_period_end ?? item?.current_period_end ?? null;
  const interval = item?.price?.recurring?.interval;

  let premiumUntil: string | null = null;
  if ((sub.status === 'active' || sub.status === 'trialing') && periodEnd) {
    premiumUntil = iso(periodEnd);
  } else if (sub.status === 'past_due' && periodEnd) {
    premiumUntil = iso(periodEnd + PAST_DUE_GRACE_DAYS * DAY_S);
  } else if (sub.status === 'canceled') {
    // Access ends when the subscription actually ended, not at the (possibly later) period end.
    premiumUntil = iso(sub.ended_at ?? Math.floor(nowMs / 1000));
  }

  return {
    stripe_subscription_id: sub.id,
    subscription_status: sub.status,
    plan_interval: interval === 'month' || interval === 'year' ? interval : null,
    cancel_at_period_end: !!sub.cancel_at_period_end,
    premium_until: premiumUntil,
  };
}

// A subscription that is still billing (or retrying) — used to stop a second
// checkout from creating a duplicate subscription.
export function isLiveSubscriptionStatus(status: string | null | undefined): boolean {
  return status === 'active' || status === 'trialing' || status === 'past_due';
}
