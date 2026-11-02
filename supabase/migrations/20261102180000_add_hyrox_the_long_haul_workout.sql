-- Add "Hyrox: The Long Haul" - 3 rounds for time of 1000m run, burpees, KB swings,
-- goblet squats, mountain climbers and sit-ups, with a 50 minute time cap.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, ownership_type, status, notes) values
('W-HYROXLONGHAUL-1793642400000', 'Hyrox: The Long Haul', 'Full Body', 'for_time', 'For Time', 'intermediate', 50,
  '["Kettlebell","Bodyweight"]'::jsonb, 'Mixed Conditioning', 'official', 'approved',
  '3 rounds for time. Time cap 50 minutes.');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK-HYROXLONGHAUL-1793642400000', 'W-HYROXLONGHAUL-1793642400000', 1, 'A', 'circuit', 'for_time', 3, 3000);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE-HYROXLONGHAUL-1', 'BLK-HYROXLONGHAUL-1793642400000', 'exercise', 'EX01914', 'Run', 1, 'distance', '1000m', '3 Rounds For Time'),
('BE-HYROXLONGHAUL-2', 'BLK-HYROXLONGHAUL-1793642400000', 'exercise', 'EX00432', 'Burpee', 2, 'reps', '30', '3 Rounds For Time'),
('BE-HYROXLONGHAUL-3', 'BLK-HYROXLONGHAUL-1793642400000', 'exercise', 'EX01919', 'Kettlebell Swing', 3, 'reps', '50', '3 Rounds For Time'),
('BE-HYROXLONGHAUL-4', 'BLK-HYROXLONGHAUL-1793642400000', 'exercise', 'EX01083', 'Goblet Squat', 4, 'reps', '40', '3 Rounds For Time'),
('BE-HYROXLONGHAUL-5', 'BLK-HYROXLONGHAUL-1793642400000', 'exercise', 'EX01544', 'Mountain Climber', 5, 'reps', '40', '3 Rounds For Time'),
('BE-HYROXLONGHAUL-6', 'BLK-HYROXLONGHAUL-1793642400000', 'exercise', NULL, 'Sit-Up', 6, 'reps', '30', '3 Rounds For Time');
