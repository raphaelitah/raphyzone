-- Add "Pull Heavy (No Machine)" - the machine-less / bar-less variant of "Pull Heavy",
-- using only TRX (rings) and dumbbells (up to 24 kg). Same structure and rest as the
-- original:
--   Eccentric pull-ups   -> Feet Elevated Ring Row (slow lowering)
--   Lat pulldown         -> Dumbbell Pullover
--   Hanging knee raises  -> Hollow Rock (optional)
-- The warm-up (ring row hold, scap rows, ring face pulls) lives in the workout notes.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, ownership_type, status, notes) values
('W-PULLHEAVYNM-1794402000000', 'Pull Heavy (No Machine)', 'Upper Body', 'strength_sets', 'Strength', 'advanced', 45,
  '["Rings / TRX","Dumbbell","Bodyweight"]'::jsonb, 'Strength / Muscular Endurance', 'official', 'approved',
  'Heavy day: work at 85-90% of your max. Warm-up (5 min): ring row hold 1 x 20-30 sec, scapular ring rows 1 x 10, ring face pulls 1 x 15.');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec, time_cap_sec) values
('BLK-PULLHEAVYNM-A-1794402000000', 'W-PULLHEAVYNM-1794402000000', 1, 'A', 'standalone', 'strength_sets', 5, 90,  null),
('BLK-PULLHEAVYNM-B-1794402000000', 'W-PULLHEAVYNM-1794402000000', 2, 'B', 'standalone', 'strength_sets', 4, 120, null),
('BLK-PULLHEAVYNM-C-1794402000000', 'W-PULLHEAVYNM-1794402000000', 3, 'C', 'standalone', 'strength_sets', 4, 120, null),
('BLK-PULLHEAVYNM-D-1794402000000', 'W-PULLHEAVYNM-1794402000000', 4, 'D', 'standalone', 'strength_sets', 3, 90,  null),
('BLK-PULLHEAVYNM-E-1794402000000', 'W-PULLHEAVYNM-1794402000000', 5, 'E', 'standalone', 'strength_sets', 3, null, null),
('BLK-PULLHEAVYNM-F-1794402000000', 'W-PULLHEAVYNM-1794402000000', 6, 'F', 'standalone', 'strength_sets', 3, null, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE-PULLHEAVYNM-1', 'BLK-PULLHEAVYNM-A-1794402000000', 'exercise', 'EX00926', 'Feet Elevated Ring Row', 1, 'reps', '3', '5 sets x 3 reps | Tempo: 3-5 sec down (eccentric) | Rest: 90 sec'),
('BE-PULLHEAVYNM-2', 'BLK-PULLHEAVYNM-B-1794402000000', 'exercise', 'EX00507', 'Chest Supported Dumbbell Row', 1, 'reps', '8', '4 sets x 8 reps | Heavy | Rest: 2 min'),
('BE-PULLHEAVYNM-3', 'BLK-PULLHEAVYNM-C-1794402000000', 'exercise', 'EX00799', 'Dumbbell Pullover', 1, 'reps', '6', '4 sets x 6 reps | Tempo: 2 sec down / 1 sec pause / controlled up | Rest: 2 min'),
('BE-PULLHEAVYNM-4', 'BLK-PULLHEAVYNM-D-1794402000000', 'exercise', 'EX00789', 'Dumbbell Marching Farmer Carry', 1, 'distance', '40m', '3 sets x 40m | Grip overload | Rest: 90 sec'),
('BE-PULLHEAVYNM-5', 'BLK-PULLHEAVYNM-E-1794402000000', 'exercise', 'EX00050', 'Active Hollow Hold', 1, 'time', '20-30 seconds', '3 sets x 20-30 sec | Core (anti-extension)'),
('BE-PULLHEAVYNM-6', 'BLK-PULLHEAVYNM-F-1794402000000', 'exercise', 'EX01214', 'Hollow Rock', 1, 'reps', '8-10', 'Optional | 3 sets x 8-10 reps');
