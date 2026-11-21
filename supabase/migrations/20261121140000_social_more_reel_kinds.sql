-- Eight more reel formats: gym humour, one movement three levels, pick a number, format explainer,
-- myth vs truth, rep timer, excuse buster, your week decided, app screen recording.
alter table public.social_posts drop constraint if exists social_posts_kind_check;
alter table public.social_posts add constraint social_posts_kind_check check (kind in
  ('reel_workout','reel_travel','carousel_humour','carousel_smarter','single_split','single_workout','carousel_workout',
   'single_equipment','carousel_quiz','carousel_format','carousel_myth','carousel_exercise',
   'reel_humour','reel_levels','reel_pick','reel_format','reel_myth','reel_timer','reel_excuse','reel_week','reel_app'));
