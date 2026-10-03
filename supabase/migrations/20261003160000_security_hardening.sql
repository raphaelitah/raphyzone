-- Security hardening from the 2026-10-03 audit.
--
-- 1. CRITICAL: profiles_update_own let any signed-in user UPDATE profiles.role
--    (table-level UPDATE grant, no column restriction), and is_admin() reads that
--    column -> any user could make themselves admin. Role changes now only come from
--    service_role (adminUsers edge function) or direct DB access (no JWT role).
-- 2. Owners could set their own workouts to status='approved', publishing them to
--    every user (workouts_select exposes approved rows). Only admins/service_role may
--    approve now; user inserts are forced to 'pending'.
-- 3. social_credentials holds the Instagram token and is service_role-only: remove
--    the default API grants as defense in depth on top of RLS.

create or replace function public.guard_profile_role()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.role := 'athlete';
  else
    new.role := old.role;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_role on public.profiles;
create trigger profiles_guard_role
  before insert or update on public.profiles
  for each row execute function public.guard_profile_role();

create or replace function public.guard_workout_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'approved' then new.status := 'pending'; end if;
  elsif new.status is distinct from old.status and new.status = 'approved' then
    new.status := old.status;
  end if;
  return new;
end;
$$;

drop trigger if exists workouts_guard_status on public.workouts;
create trigger workouts_guard_status
  before insert or update on public.workouts
  for each row execute function public.guard_workout_status();

revoke all on public.social_credentials from anon, authenticated;
