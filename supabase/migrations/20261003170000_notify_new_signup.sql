-- Email the admin when someone signs up: an AFTER INSERT trigger on profiles
-- (created by handle_new_user) posts the new user's id to the notifySignup edge
-- function through pg_net. Fire-and-forget and wrapped in an exception block, so
-- a missing secret or an outage can never block a signup.
--
-- One-time setup (the secret is not in this file):
--   select vault.create_secret('<random string>', 'notify_webhook_secret');
--   supabase secrets set NOTIFY_WEBHOOK_SECRET=<same string> SMTP_USER=... SMTP_PASS=...
create extension if not exists pg_net with schema extensions;

create or replace function public.notify_new_signup()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  secret text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets where name = 'notify_webhook_secret';
  if secret is null then return new; end if;
  perform net.http_post(
    url := 'https://tdxcdvalriekeddahkev.supabase.co/functions/v1/notifySignup',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-notify-secret', secret),
    body := jsonb_build_object('user_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

revoke all on function public.notify_new_signup() from public, anon, authenticated;

create trigger profiles_notify_new_signup
  after insert on public.profiles
  for each row execute function public.notify_new_signup();
