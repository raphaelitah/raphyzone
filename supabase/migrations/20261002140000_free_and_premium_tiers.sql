-- Free / premium tiers (foundation, no payment provider yet).
--
-- Access model:
--   * Premium = admin, OR an admin-granted override, OR a paid period still in
--     the future (premium_until — a Stripe webhook will set this later), OR a
--     trial still running (trial_ends_at). Everyone else is on the free tier.
--   * Free tier: workouts flagged is_free, plus a monthly quota of AI actions
--     (plan generation, swaps, exercise substitutes) configurable in app_settings.
--   * Entitlements are NOT stored on profiles: profiles_update_own lets a user
--     write any column on their own row, so a trial/premium flag there could be
--     self-granted. user_entitlements has no client write policies at all.

-- ---------------------------------------------------------------------------
-- Admin-tunable settings
-- ---------------------------------------------------------------------------
create table public.app_settings (
  key text primary key,
  value jsonb not null,
  updated_date timestamptz not null default now()
);

alter table public.app_settings enable row level security;

create policy app_settings_select on public.app_settings
  for select to authenticated using (true);
create policy app_settings_admin_write on public.app_settings
  for all to authenticated using (is_admin()) with check (is_admin());

insert into public.app_settings (key, value) values
  ('trial_days', '14'::jsonb),
  ('free_ai_actions_per_month', '1'::jsonb);

-- ---------------------------------------------------------------------------
-- Per-user entitlements (read-only from the client)
-- ---------------------------------------------------------------------------
create table public.user_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  trial_ends_at timestamptz,
  premium_override boolean not null default false,
  premium_until timestamptz,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now()
);

alter table public.user_entitlements enable row level security;

create policy user_entitlements_select_own_or_admin on public.user_entitlements
  for select to authenticated using (user_id = (select auth.uid()) or is_admin());

-- AI action ledger: one row per metered call, so the monthly quota is a count.
create table public.ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null,
  created_date timestamptz not null default now()
);

create index ai_usage_user_month_idx on public.ai_usage (user_id, created_date desc);

alter table public.ai_usage enable row level security;

create policy ai_usage_select_own_or_admin on public.ai_usage
  for select to authenticated using (user_id = (select auth.uid()) or is_admin());

-- ---------------------------------------------------------------------------
-- Which workouts the free tier can use
-- ---------------------------------------------------------------------------
alter table public.workouts add column is_free boolean not null default false;

-- workouts_update lets an owner edit their own rows; only admins may decide
-- what is free (otherwise a submitted personal workout could be flagged free).
create or replace function public.guard_workout_is_free()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $$
begin
  if coalesce(auth.role(), '') = 'service_role' or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.is_free := false;
  else
    new.is_free := old.is_free;
  end if;
  return new;
end;
$$;

create trigger workouts_guard_is_free
  before insert or update on public.workouts
  for each row execute function public.guard_workout_is_free();

-- ---------------------------------------------------------------------------
-- Entitlement functions
-- ---------------------------------------------------------------------------
create or replace function public.is_premium(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select exists (select 1 from public.profiles where id = p_user and role = 'admin')
      or exists (
        select 1 from public.user_entitlements e
        where e.user_id = p_user
          and (e.premium_override or e.premium_until > now() or e.trial_ends_at > now())
      );
$$;

create or replace function public.setting_int(p_key text, p_default int)
returns int
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select coalesce((select (value #>> '{}')::int from public.app_settings where key = p_key), p_default);
$$;

-- Everything the client needs to render locks, banners and quota hints.
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
    'ai_limit', case when prem then null else lim end,
    'ai_used', used,
    'ai_remaining', case when prem then null else greatest(lim - used, 0) end
  );
end;
$$;

-- Starting a workout session requires the workout to be free (or the user to be
-- premium, or the workout to be their own). Unknown codes are allowed: they can't
-- be catalog content.
create or replace function public.can_access_workout(p_workout_code text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_workout_code is null
      or public.is_premium(auth.uid())
      or exists (
        select 1 from public.workouts w
        where w.workout_id = p_workout_code and (w.is_free or w.owner_id = auth.uid())
      )
      or not exists (select 1 from public.workouts w where w.workout_id = p_workout_code);
$$;

create policy workout_sessions_premium_gate on public.workout_sessions
  as restrictive for insert to authenticated
  with check (public.can_access_workout(workout_id));

-- Atomically checks the monthly quota and records the use. Called only from
-- edge functions (service role) before running a metered AI action. The
-- advisory lock serialises concurrent calls for the same user so two parallel
-- requests can't both slip under the limit.
create or replace function public.consume_ai_action(p_user uuid, p_action text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  lim int;
  used int;
  new_id uuid;
  prem boolean;
begin
  perform pg_advisory_xact_lock(hashtext('ai_usage:' || p_user::text));
  prem := public.is_premium(p_user);
  lim := public.setting_int('free_ai_actions_per_month', 1);
  select count(*) into used from public.ai_usage
    where user_id = p_user and created_date >= date_trunc('month', now());

  if not prem and used >= lim then
    return jsonb_build_object('allowed', false, 'used', used, 'limit', lim);
  end if;

  insert into public.ai_usage (user_id, action) values (p_user, p_action) returning id into new_id;
  return jsonb_build_object('allowed', true, 'usage_id', new_id, 'premium', prem, 'used', used + 1, 'limit', lim);
end;
$$;

-- Gives the quota back when the metered action itself failed.
create or replace function public.refund_ai_action(p_usage_id uuid)
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  delete from public.ai_usage where id = p_usage_id;
$$;

revoke all on function public.consume_ai_action(uuid, text) from public, anon, authenticated;
revoke all on function public.refund_ai_action(uuid) from public, anon, authenticated;
grant execute on function public.consume_ai_action(uuid, text) to service_role;
grant execute on function public.refund_ai_action(uuid) to service_role;

revoke all on function public.is_premium(uuid) from public, anon;
grant execute on function public.is_premium(uuid) to authenticated, service_role;
revoke all on function public.setting_int(text, int) from public, anon;
grant execute on function public.setting_int(text, int) to authenticated, service_role;
revoke all on function public.my_entitlement() from public, anon;
grant execute on function public.my_entitlement() to authenticated, service_role;
revoke all on function public.can_access_workout(text) from public, anon;
grant execute on function public.can_access_workout(text) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- New signups start a trial; existing users get a fresh one at launch
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $function$
begin
  insert into public.profiles (id, role) values (new.id, 'athlete');
  insert into public.user_entitlements (user_id, trial_ends_at)
    values (new.id, now() + make_interval(days => public.setting_int('trial_days', 14)));
  return new;
end;
$function$;

insert into public.user_entitlements (user_id, trial_ends_at)
select p.id, now() + make_interval(days => public.setting_int('trial_days', 14))
from public.profiles p
on conflict (user_id) do nothing;
