-- Add "Pull Heavy" - a pull-biased heavy strength day (85-90% of max):
-- eccentric pull-ups, chest-supported DB row, lat pulldown, farmer carry and
-- an anti-extension core finisher (hollow hold, optional hanging knee raises).
-- The warm-up (dead hang, scap pulls, face pulls) lives in the workout notes.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, ownership_type, status, notes) values
('W-PULLHEAVY-1794398400000', 'Pull Heavy', 'Upper Body', 'strength_sets', 'Strength', 'advanced', 45,
  '["Pull-Up Bar","Cable / Machine","Dumbbell","Rings / TRX","Bodyweight"]'::jsonb, 'Strength / Muscular Endurance', 'official', 'approved',
  'Heavy day: work at 85-90% of your max. Warm-up (5 min): dead hang 1 x 20-30 sec, scap pulls 1 x 10, face pulls 1 x 15.');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec, time_cap_sec) values
('BLK-PULLHEAVY-A-1794398400000', 'W-PULLHEAVY-1794398400000', 1, 'A', 'standalone', 'strength_sets', 5, 90,  null),
('BLK-PULLHEAVY-B-1794398400000', 'W-PULLHEAVY-1794398400000', 2, 'B', 'standalone', 'strength_sets', 4, 120, null),
('BLK-PULLHEAVY-C-1794398400000', 'W-PULLHEAVY-1794398400000', 3, 'C', 'standalone', 'strength_sets', 4, 120, null),
('BLK-PULLHEAVY-D-1794398400000', 'W-PULLHEAVY-1794398400000', 4, 'D', 'standalone', 'strength_sets', 3, 90,  null),
('BLK-PULLHEAVY-E-1794398400000', 'W-PULLHEAVY-1794398400000', 5, 'E', 'standalone', 'strength_sets', 3, null, null),
('BLK-PULLHEAVY-F-1794398400000', 'W-PULLHEAVY-1794398400000', 6, 'F', 'standalone', 'strength_sets', 3, null, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE-PULLHEAVY-1', 'BLK-PULLHEAVY-A-1794398400000', 'exercise', 'EX01761', 'Pronated Pull Up Negative', 1, 'reps', '3', '5 sets x 3 reps | Tempo: 3-5 sec down | Rest: 90 sec'),
('BE-PULLHEAVY-2', 'BLK-PULLHEAVY-B-1794398400000', 'exercise', 'EX00507', 'Chest Supported Dumbbell Row', 1, 'reps', '8', '4 sets x 8 reps | Heavy | Rest: 2 min'),
('BE-PULLHEAVY-3', 'BLK-PULLHEAVY-C-1794398400000', 'exercise', 'EX01443', 'Lat Pulldown', 1, 'reps', '6', '4 sets x 6 reps | Tempo: 2 sec down / 1 sec pause / controlled up | Rest: 2 min'),
('BE-PULLHEAVY-4', 'BLK-PULLHEAVY-D-1794398400000', 'exercise', 'EX00789', 'Dumbbell Marching Farmer Carry', 1, 'distance', '40m', '3 sets x 40m | Grip overload | Rest: 90 sec'),
('BE-PULLHEAVY-5', 'BLK-PULLHEAVY-E-1794398400000', 'exercise', 'EX00050', 'Active Hollow Hold', 1, 'time', '20-30 seconds', '3 sets x 20-30 sec | Core (anti-extension)'),
('BE-PULLHEAVY-6', 'BLK-PULLHEAVY-F-1794398400000', 'exercise', 'EX01154', 'Hanging Knee Raise', 1, 'reps', '8-10', 'Optional | 3 sets x 8-10 reps');
