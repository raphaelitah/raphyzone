-- Five more image-post formats: equipment card, quiz, format explainer, myth vs truth, movement pattern.
alter table public.social_posts drop constraint if exists social_posts_kind_check;
alter table public.social_posts add constraint social_posts_kind_check check (kind in
  ('reel_workout','reel_travel','carousel_humour','carousel_smarter','single_split','single_workout','carousel_workout',
   'single_equipment','carousel_quiz','carousel_format','carousel_myth','carousel_exercise'));
