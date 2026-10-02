-- Stripe subscription state, mirrored onto user_entitlements by the
-- stripeWebhook edge function (service role). premium_until (already part of
-- is_premium) is set from the subscription's current period end, so access
-- simply lapses when a subscription stops renewing.
alter table public.user_entitlements
  add column stripe_customer_id text unique,
  add column stripe_subscription_id text,
  add column subscription_status text,
  add column plan_interval text check (plan_interval in ('month', 'year')),
  add column cancel_at_period_end boolean not null default false;

-- Same as before plus the billing fields the client needs to offer
-- "Manage subscription" and to say when a cancelled plan ends.
create or replace function public.my_entitlement()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  ent public.user_entitlements;
  prem boolean;
  reason text;
  lim int;
  used int;
begin
  if uid is null then return null; end if;
  select * into ent from public.user_entitlements where user_id = uid;
  prem := public.is_premium(uid);

  reason := case
    when exists (select 1 from public.profiles where id = uid and role = 'admin') then 'admin'
    when coalesce(ent.premium_override, false) then 'override'
    when ent.premium_until > now() then 'subscription'
    when ent.trial_ends_at > now() then 'trial'
    else 'free'
  end;

  lim := public.setting_int('free_ai_actions_per_month', 1);
  select count(*) into used from public.ai_usage
    where user_id = uid and created_date >= date_trunc('month', now());

  return jsonb_build_object(
    'is_premium', prem,
    'reason', reason,
    'trial_ends_at', ent.trial_ends_at,
    'premium_until', ent.premium_until,
    'has_billing', ent.stripe_customer_id is not null,
    'subscription_status', ent.subscription_status,
    'plan_interval', ent.plan_interval,
    'cancel_at_period_end', coalesce(ent.cancel_at_period_end, false),
    'ai_limit', case when prem then null else lim end,
    'ai_used', used,
    'ai_remaining', case when prem then null else greatest(lim - used, 0) end
  );
end;
$$;
