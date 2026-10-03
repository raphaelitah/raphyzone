-- Instagram content engine: post queue, weekly performance metrics, public
-- asset bucket, and first-touch sign-up attribution (UTM) for the trial funnel.
--
-- social_posts / social_weekly_metrics are only touched by the GitHub Actions
-- scripts (service role, bypasses RLS) and the admin approval page (is_admin()).

create table public.social_posts (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  slot smallint not null check (slot between 1 and 7),
  kind text not null check (kind in
    ('reel_workout','reel_travel','carousel_humour','carousel_smarter','single_split')),
  status text not null default 'draft'
    check (status in ('draft','approved','killed','redo','published')),
  hook text,
  caption text,
  hashtags text[] not null default '{}',
  slides jsonb not null default '[]'::jsonb,       -- carousel/single slide copy
  script jsonb,                                    -- reel script (scenes, voiceover, on-screen text)
  source_workout_ids text[] not null default '{}', -- workouts.workout_id the post is built from
  asset_urls text[] not null default '{}',         -- rendered files in the social-assets bucket
  render_status text not null default 'pending'
    check (render_status in ('pending','rendered','failed')),
  render_error text,
  scheduled_date date,
  ig_media_id text,
  published_at timestamptz,
  publish_error text,
  redo_note text,
  created_date timestamptz not null default now(),
  updated_date timestamptz not null default now(),
  unique (week_start, slot)
);
create index social_posts_status_date_idx on public.social_posts (status, scheduled_date);

create table public.social_weekly_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.social_posts(id) on delete cascade,
  week_start date not null,           -- Monday the metrics were pulled
  reach integer,
  views integer,
  likes integer,
  comments integer,
  saves integer,
  shares integer,
  profile_visits integer,
  raw jsonb,
  created_date timestamptz not null default now(),
  unique (post_id, week_start)
);

alter table public.social_posts enable row level security;
alter table public.social_weekly_metrics enable row level security;

create policy social_posts_admin on public.social_posts
  for all to authenticated using (is_admin()) with check (is_admin());
create policy social_metrics_admin on public.social_weekly_metrics
  for all to authenticated using (is_admin()) with check (is_admin());

-- Public bucket for rendered carousels/reels (Instagram fetches media by URL).
-- Reads are public; writes only via the service role (no insert policy).
insert into storage.buckets (id, name, public, file_size_limit)
values ('social-assets', 'social-assets', true, 104857600)
on conflict (id) do nothing;

-- ---------------------------------------------------------------------------
-- First-touch sign-up attribution
-- ---------------------------------------------------------------------------
create table public.user_attribution (
  user_id uuid primary key references auth.users(id) on delete cascade,
  utm_source text,
  utm_medium text,
  utm_campaign text,
  utm_content text,
  landing_path text,
  created_date timestamptz not null default now()
);
alter table public.user_attribution enable row level security;
create policy user_attribution_read on public.user_attribution
  for select to authenticated using (user_id = (select auth.uid()) or is_admin());

-- Called once after sign-in with whatever the browser captured on first visit.
-- First touch wins: a later call never overwrites. Rows are written only here,
-- so users cannot edit their own attribution afterwards.
create or replace function public.record_attribution(p jsonb)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  if auth.uid() is null then return; end if;
  insert into public.user_attribution
    (user_id, utm_source, utm_medium, utm_campaign, utm_content, landing_path)
  values (
    auth.uid(),
    left(nullif(p->>'utm_source',''), 100),
    left(nullif(p->>'utm_medium',''), 100),
    left(nullif(p->>'utm_campaign',''), 100),
    left(nullif(p->>'utm_content',''), 100),
    left(nullif(p->>'landing_path',''), 200)
  )
  on conflict (user_id) do nothing;
end;
$$;
revoke all on function public.record_attribution(jsonb) from public, anon;
grant execute on function public.record_attribution(jsonb) to authenticated;
