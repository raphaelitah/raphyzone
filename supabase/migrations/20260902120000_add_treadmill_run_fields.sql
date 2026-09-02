-- Treadmill running is a distinct exercise from outdoor Run (EX01914): it is
-- performed on equipment that lets the athlete set speed and incline. Duration
-- is already covered by the existing prescription fields, so only speed and
-- incline are new here.
alter table public.block_exercises
  add column speed numeric,
  add column incline numeric;

insert into public.exercises (
  exercise_code, name, video_url, source, movement_category, body_region,
  movement_pattern, primary_muscle_group, secondary_muscle_group, equipment,
  modality, laterality, compound_isolation, impact_level, technical_difficulty,
  physical_demand, requires_load, default_prescription_unit, notes,
  author_id, author_name, submission_status, rejection_reason,
  created_date, updated_date
) values (
  'EX02900', 'Treadmill Run', NULL, 'Video links', 'Conditioning', 'Lower Body',
  'Locomotion / Cardio', 'Cardiorespiratory', 'Quadriceps', 'Treadmill',
  'Cyclical / Monostructural', 'Bilateral', 'Compound', 'Low', 2, 3,
  false, 'Distance / Time', NULL,
  NULL, NULL, 'approved', NULL,
  now(), now()
);
