-- Sunday recap story: the week's pick gets a second Story ("In case you missed it").
-- recap_chosen_at marks the pick, recap_asset_url is the rendered 9:16 image, and the
-- rest records the publish. Written only by the GitHub Actions scripts (service role).
alter table public.social_posts
  add column if not exists recap_chosen_at timestamptz,
  add column if not exists recap_asset_url text,
  add column if not exists recap_story_media_id text,
  add column if not exists recap_story_published_at timestamptz,
  add column if not exists recap_story_error text;
