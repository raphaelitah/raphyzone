-- Two more Instagram post formats built from a real catalog workout:
--   single_workout   one-screen workout card (saveable)
--   carousel_workout swipe-through of the workout, block by block
alter table public.social_posts drop constraint if exists social_posts_kind_check;
alter table public.social_posts add constraint social_posts_kind_check check (kind in
  ('reel_workout','reel_travel','carousel_humour','carousel_smarter','single_split','single_workout','carousel_workout'));
