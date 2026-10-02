-- Master switch for the free/premium split. When app_settings.paywall_enabled is
-- false, is_premium() is true for everyone, so every gate built on it (session
-- starts, the AI quota, free-only catalogs for plan generation) opens at once.
-- Subscriptions and trial data are untouched, so turning it back on restores
-- exactly the previous state.
insert into public.app_settings (key, value) values ('paywall_enabled', 'true'::jsonb)
on conflict (key) do nothing;

create or replace function public.setting_bool(p_key text, p_default boolean)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select (value #>> '{}')::boolean from public.app_settings where key = p_key), p_default);
$$;

revoke all on function public.setting_bool(text, boolean) from public, anon;
grant execute on function public.setting_bool(text, boolean) to authenticated, service_role;

create or replace function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select not public.setting_bool('paywall_enabled', true)
      or exists (select 1 from public.profiles where id = p_user and role = 'admin')
      or exists (
        select 1 from public.user_entitlements e
        where e.user_id = p_user
          and (e.premium_override or e.premium_until > now() or e.trial_ends_at > now())
      );
$$;

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
  paywall boolean;
  reason text;
  lim int;
  used int;
begin
  if uid is null then return null; end if;
  select * into ent from public.user_entitlements where user_id = uid;
  paywall := public.setting_bool('paywall_enabled', true);
  prem := public.is_premium(uid);

  reason := case
    when not paywall then 'open'
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
    'paywall_enabled', paywall,
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
