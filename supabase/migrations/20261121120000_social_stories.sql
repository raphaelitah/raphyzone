-- Same-day Instagram Story teaser for each published post: the rendered 9:16 image,
-- the story's media id once published, and any error. Written only by the GitHub
-- Actions scripts (service role); the admin page can read them under the existing policy.
alter table public.social_posts
  add column if not exists story_asset_url text,
  add column if not exists story_media_id text,
  add column if not exists story_published_at timestamptz,
  add column if not exists story_error text;
