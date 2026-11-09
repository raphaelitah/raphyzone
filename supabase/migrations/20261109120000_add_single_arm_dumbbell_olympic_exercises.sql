-- Dumbbell counterparts for single-arm kettlebell clean/snatch exercises.
--
-- The catalog only had bilateral/dual dumbbell versions of these movements
-- (e.g. "Dumbbell Clean + Press", "Dual Dumbbell Snatch"), so there was nothing
-- to pair a single-arm kettlebell exercise with for an athlete who owns
-- dumbbells but no kettlebells. Each new row is cloned from its kettlebell
-- source so movement pattern, modality, difficulty and benchmark metadata stay
-- consistent, then re-tagged as a Dumbbell exercise.
--
-- Overrides on the clone:
--  * equipment 'Dumbbell' (the kettlebell source says 'Kettlebell') and
--    equipment_tags, which is a separate jsonb column that defaults to '[]'
--    (nothing derives it from `equipment`, and an empty list reads as "needs no
--    equipment" to the plan matcher). The source's tags are carried over with
--    'Kettlebell' swapped for 'Dumbbells'. The stray 'Barbell' tag the catalog
--    puts on clean/snatch rows is dropped: these are dumbbell movements, and
--    keeping it would hide them from an athlete who owns dumbbells but no barbell.
--  * video_url NULL: the source's video demonstrates a kettlebell.
--  * laterality 'Unilateral' and implement_count 1: one dumbbell, one hand.
--  * dumbbell_substitutable false: it is already a dumbbell exercise.
--
-- Guarded by name and code so re-running, or a code already taken in the live
-- catalog, inserts nothing instead of failing the unique indexes.
insert into public.exercises (
  exercise_code, name, video_url, source, movement_category, body_region,
  movement_pattern, primary_muscle_group, secondary_muscle_group, equipment, equipment_tags,
  modality, laterality, compound_isolation, impact_level, technical_difficulty,
  physical_demand, requires_load, default_prescription_unit, notes,
  author_id, author_name, submission_status, rejection_reason,
  benchmark_pattern, benchmark_ratio, implement_count, dumbbell_substitutable,
  created_date, updated_date
)
select
  n.new_code, n.new_name, NULL, src.source, src.movement_category, src.body_region,
  src.movement_pattern, src.primary_muscle_group, src.secondary_muscle_group, 'Dumbbell',
  coalesce(
    (select jsonb_agg(t) from jsonb_array_elements_text(src.equipment_tags) as t where t not in ('Kettlebell', 'Barbell')),
    '[]'::jsonb
  ) || '["Dumbbells"]'::jsonb,
  src.modality, 'Unilateral', src.compound_isolation, src.impact_level, src.technical_difficulty,
  src.physical_demand, src.requires_load, src.default_prescription_unit, NULL,
  NULL, NULL, 'approved', NULL,
  src.benchmark_pattern, src.benchmark_ratio, 1, false,
  now(), now()
from (values
  ('EX02901', 'Single Arm Dumbbell Clean + Press',              'EX02173'),
  ('EX02902', 'Single Arm Alternating Dumbbell Clean + Press',  'EX02092'),
  ('EX02903', 'Single Arm Dumbbell Hang Clean',                 'EX02259'),
  ('EX02904', 'Single Arm Dumbbell Clean and Push Press',       'EX02174'),
  ('EX02905', 'Single Arm Dumbbell Clean + Cossack Squat',      'EX02172'),
  ('EX02906', 'Single Arm Dumbbell Hang Power Snatch',          'EX01346'),
  ('EX02907', 'Single Arm Dumbbell Snatch',                     'EX01360')
) as n(new_code, new_name, source_code)
join public.exercises src on src.exercise_code = n.source_code
where not exists (select 1 from public.exercises e where e.exercise_code = n.new_code)
  and not exists (select 1 from public.exercises e where lower(trim(e.name)) = lower(trim(n.new_name)));
