-- Track real app usage. auth.users.last_sign_in_at only moves on a fresh sign-in,
-- so users who stay logged in for weeks look dormant. The client calls
-- touch_last_active() when the app opens / returns to the foreground (throttled).
alter table public.profiles add column if not exists last_active_at timestamptz;

update public.profiles p
set last_active_at = u.last_sign_in_at
from auth.users u
where u.id = p.id and p.last_active_at is null;

create or replace function public.touch_last_active()
returns void
language sql
security definer
set search_path to 'public', 'pg_temp'
as $$
  update public.profiles
  set last_active_at = now()
  where id = auth.uid()
    and (last_active_at is null or last_active_at < now() - interval '10 minutes');
$$;

revoke all on function public.touch_last_active() from public, anon;
grant execute on function public.touch_last_active() to authenticated;
