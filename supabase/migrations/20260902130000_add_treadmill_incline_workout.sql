-- "The cardio trick to lose fat fast (and NO running)": a 28-minute treadmill
-- interval program of 6 steps with increasing speed/incline, no rest between
-- steps. Uses the new Treadmill Run exercise (EX02900) and its speed/incline
-- columns on block_exercises.
insert into public.workouts (
  workout_id, name, workout_date, workout_category, workout_format, format_label,
  difficulty, est_duration_min, description, goal, split, duration_minutes,
  equipment, modality, notes, ownership_type, status, movement_focus, exercises,
  created_date, updated_date
) values (
  '5c5eeb48ecc51b950cb9432c', 'Treadmill Incline Fat Burn', NULL, 'Conditioning', 'circuit', 'Circuit',
  'intermediate', 28, 'Treadmill interval walk/jog with progressively increasing speed and incline.',
  'fat_loss', NULL, NULL,
  '["Treadmill"]'::jsonb, 'Cyclical / Monostructural', NULL, 'official', 'approved', NULL, '[]'::jsonb,
  now(), now()
);

insert into public.workout_blocks (
  block_id, workout_id, order_index, block_label, block_type, workout_format,
  rounds, rest_between_rounds_sec, time_cap_sec, created_date, updated_date
) values (
  'BLK00277', '5c5eeb48ecc51b950cb9432c', 1, 'A', 'standalone', 'circuit',
  NULL, 0, 1680, now(), now()
);

insert into public.block_exercises (
  block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw,
  referenced_workout_id, referenced_block_id, order_in_block,
  prescription_type, prescription_value, load_type, load_value, notes,
  speed, incline, created_date, updated_date
) values
  ('BE00614', 'BLK00277', 'exercise', 'EX02900', 'Treadmill Run', NULL, NULL, 1, 'time', '2 min', NULL, NULL, 'Warm up', 2.5, 0, now(), now()),
  ('BE00615', 'BLK00277', 'exercise', 'EX02900', 'Treadmill Run', NULL, NULL, 2, 'time', '6 min', NULL, NULL, 'Warm up', 2.8, 8, now(), now()),
  ('BE00616', 'BLK00277', 'exercise', 'EX02900', 'Treadmill Run', NULL, NULL, 3, 'time', '5 min', NULL, NULL, NULL, 3.2, 10, now(), now()),
  ('BE00617', 'BLK00277', 'exercise', 'EX02900', 'Treadmill Run', NULL, NULL, 4, 'time', '5 min', NULL, NULL, NULL, 3.5, 12, now(), now()),
  ('BE00618', 'BLK00277', 'exercise', 'EX02900', 'Treadmill Run', NULL, NULL, 5, 'time', '5 min', NULL, NULL, NULL, 3.7, 13.5, now(), now()),
  ('BE00619', 'BLK00277', 'exercise', 'EX02900', 'Treadmill Run', NULL, NULL, 6, 'time', '5 min', NULL, NULL, NULL, 4.0, 15, now(), now());
