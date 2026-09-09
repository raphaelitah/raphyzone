-- Equipment matching (see supabase/functions/_shared/warmupGenerator.ts and
-- planContext.ts) currently requires an athlete to own every equipment_tags
-- entry an exercise carries, with only 'Adjustable Dumbbells' -> 'Dumbbells'
-- treated as equivalent. That's too strict for a lot of Kettlebell-tagged
-- exercises: a goblet squat, rack carry, or floor press only uses the bell as
-- a loaded mass, and an athlete who owns Dumbbells instead can do the exact
-- same movement. It's NOT true for exercises that depend on the kettlebell's
-- offset handle specifically — ballistic swing/clean/snatch/high-pull moves,
-- the upside-down "bottoms up" grip, the horn/halo grip, or passing the bell
-- figure-eight between the legs — those stay Kettlebell-only.
--
-- dumbbell_substitutable flags the former group so the equipment matcher can
-- treat 'Kettlebell' as satisfied by owning Dumbbells for these specific
-- exercises, without opening up a blanket Dumbbell<->Kettlebell equivalence
-- that would incorrectly cover the ballistic/grip-dependent ones too.
alter table public.exercises
  add column if not exists dumbbell_substitutable boolean not null default false;

comment on column public.exercises.dumbbell_substitutable is
  'True for a Kettlebell-tagged exercise that uses the bell purely as a loaded mass (goblet/rack/carry/press/curl/etc), so an athlete who owns Dumbbells instead of Kettlebell can still be assigned it. False (default) for anything depending on the kettlebell''s offset handle: ballistic swing/clean/snatch/high-pull, bottoms-up grip, horn/halo grip, or figure-eight passes.';

update public.exercises set dumbbell_substitutable = true
where exercise_code in (
  'EX00033', 'EX00071', 'EX00073', 'EX00074', 'EX00075', 'EX00098', 'EX00156', 'EX00214', 'EX00328', 'EX00344',
  'EX00359', 'EX00363', 'EX00440', 'EX00510', 'EX00556', 'EX00557', 'EX00558', 'EX00559', 'EX00578', 'EX00590',
  'EX00635', 'EX00650', 'EX00699', 'EX00700', 'EX00703', 'EX00704', 'EX00705', 'EX00706', 'EX00707', 'EX00708',
  'EX00709', 'EX00710', 'EX00711', 'EX00712', 'EX00713', 'EX00715', 'EX00881', 'EX00883', 'EX00901', 'EX00921',
  'EX00930', 'EX01007', 'EX01028', 'EX01029', 'EX01030', 'EX01031', 'EX01032', 'EX01061', 'EX01077', 'EX01078',
  'EX01096', 'EX01113', 'EX01115', 'EX01179', 'EX01219', 'EX01247', 'EX01248', 'EX01264', 'EX01265', 'EX01270',
  'EX01308', 'EX01310', 'EX01311', 'EX01312', 'EX01313', 'EX01318', 'EX01319', 'EX01320', 'EX01321', 'EX01322',
  'EX01323', 'EX01324', 'EX01325', 'EX01326', 'EX01327', 'EX01328', 'EX01329', 'EX01331', 'EX01332', 'EX01333',
  'EX01334', 'EX01335', 'EX01336', 'EX01337', 'EX01338', 'EX01339', 'EX01340', 'EX01341', 'EX01342', 'EX01343',
  'EX01347', 'EX01348', 'EX01350', 'EX01351', 'EX01352', 'EX01353', 'EX01354', 'EX01355', 'EX01356', 'EX01357',
  'EX01358', 'EX01359', 'EX01363', 'EX01364', 'EX01365', 'EX01366', 'EX01367', 'EX01368', 'EX01369', 'EX01370',
  'EX01371', 'EX01372', 'EX01373', 'EX01374', 'EX01375', 'EX01376', 'EX01377', 'EX01559', 'EX01615', 'EX01616',
  'EX01619', 'EX01625', 'EX01626', 'EX01777', 'EX01805', 'EX01835', 'EX01958', 'EX02001', 'EX02017', 'EX02032',
  'EX02107', 'EX02157', 'EX02158', 'EX02159', 'EX02163', 'EX02167', 'EX02168', 'EX02169', 'EX02170', 'EX02171',
  'EX02176', 'EX02177', 'EX02178', 'EX02179', 'EX02180', 'EX02181', 'EX02182', 'EX02183', 'EX02185', 'EX02186',
  'EX02187', 'EX02188', 'EX02189', 'EX02190', 'EX02191', 'EX02192', 'EX02193', 'EX02194', 'EX02195', 'EX02196',
  'EX02198', 'EX02201', 'EX02257', 'EX02258', 'EX02260', 'EX02261', 'EX02262', 'EX02292', 'EX02296', 'EX02297',
  'EX02298', 'EX02314', 'EX02392', 'EX02403', 'EX02429', 'EX02430', 'EX02433', 'EX02541', 'EX02545', 'EX02564',
  'EX02622', 'EX02671', 'EX02672', 'EX02696', 'EX02722', 'EX02752', 'EX02758', 'EX02765'
);
