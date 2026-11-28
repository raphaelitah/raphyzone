-- The Saturday image post is now a push/pull/legs split every fourth week and a
-- single featured workout in between.
alter table public.social_posts drop constraint social_posts_kind_check;
alter table public.social_posts add constraint social_posts_kind_check
  check (kind in ('reel_workout','reel_travel','carousel_humour','carousel_smarter','single_split','single_workout'));
