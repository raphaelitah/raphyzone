import { describe, it, expect } from 'vitest';
import { entitlementFromSubscription, isLiveSubscriptionStatus } from '../../supabase/functions/_shared/subscriptionState.ts';

const NOW = Date.UTC(2026, 9, 2) ; // 2026-10-02
const inDays = (d) => Math.floor(NOW / 1000) + d * 86400;
const sub = (over = {}) => ({
  id: 'sub_1',
  status: 'active',
  cancel_at_period_end: false,
  current_period_end: inDays(30),
  items: { data: [{ price: { recurring: { interval: 'month' } } }] },
  ...over,
});

describe('entitlementFromSubscription', () => {
  it('grants access until the period end while active', () => {
    const p = entitlementFromSubscription(sub(), NOW);
    expect(p.premium_until).toBe(new Date(inDays(30) * 1000).toISOString());
    expect(p.plan_interval).toBe('month');
    expect(p.subscription_status).toBe('active');
  });

  it('reads the period end from the item on newer Stripe API versions', () => {
    const p = entitlementFromSubscription(
      sub({ current_period_end: undefined, items: { data: [{ current_period_end: inDays(365), price: { recurring: { interval: 'year' } } }] } }),
      NOW,
    );
    expect(p.premium_until).toBe(new Date(inDays(365) * 1000).toISOString());
    expect(p.plan_interval).toBe('year');
  });

  it('keeps access until period end when cancelling at period end', () => {
    const p = entitlementFromSubscription(sub({ cancel_at_period_end: true }), NOW);
    expect(p.cancel_at_period_end).toBe(true);
    expect(p.premium_until).toBe(new Date(inDays(30) * 1000).toISOString());
  });

  it('gives past-due subscriptions a 3-day grace period', () => {
    const p = entitlementFromSubscription(sub({ status: 'past_due' }), NOW);
    expect(p.premium_until).toBe(new Date(inDays(33) * 1000).toISOString());
  });

  it('ends access when the subscription is cancelled', () => {
    const p = entitlementFromSubscription(sub({ status: 'canceled', ended_at: inDays(-1) }), NOW);
    expect(p.premium_until).toBe(new Date(inDays(-1) * 1000).toISOString());
  });

  it('gives no access for incomplete or unpaid subscriptions', () => {
    expect(entitlementFromSubscription(sub({ status: 'incomplete' }), NOW).premium_until).toBeNull();
    expect(entitlementFromSubscription(sub({ status: 'unpaid' }), NOW).premium_until).toBeNull();
  });
});

describe('isLiveSubscriptionStatus', () => {
  it('blocks a second checkout only while a subscription is still billing', () => {
    expect(['active', 'trialing', 'past_due'].every(isLiveSubscriptionStatus)).toBe(true);
    expect(['canceled', 'incomplete', null, undefined].some(isLiveSubscriptionStatus)).toBe(false);
  });
});
