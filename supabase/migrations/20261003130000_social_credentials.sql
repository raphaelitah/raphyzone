-- Holds the rotating Instagram long-lived token. GitHub Actions cannot write its
-- own repo secrets, so the refresh job keeps the current token here and the
-- INSTAGRAM_ACCESS_TOKEN secret is only the seed. Service role only: RLS is on
-- and there are deliberately no policies.
create table public.social_credentials (
  key text primary key,
  value text not null,
  updated_date timestamptz not null default now()
);
alter table public.social_credentials enable row level security;
