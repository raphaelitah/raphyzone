-- Add "Push (Chest + Triceps) - Long": a ~90 minute extension of "Push (Chest + Triceps)"
-- (6a8b5ff82f65fc56923ecc84). Barbell, EZ bar, dumbbell and TRX/bodyweight movements only.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, split, goal, ownership_type, status, is_free) values
('W-PUSH-CHEST-TRI-LONG-1794830400000', 'Push (Chest + Triceps) - Long', 'Upper Body', 'strength_sets', 'Bodybuilding', 'intermediate', 90,
  '["Barbell","EZ Bar","Dumbbell","Bench / Box","Rings / TRX","Bodyweight"]'::jsonb, 'Strength / Muscular Endurance', 'Push', 'hypertrophy', 'official', 'approved', true);

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec) values
('BLK-PCTL-1', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 1, 'A', 'standalone', 'strength_sets', 5, 120),
('BLK-PCTL-2', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 2, 'B', 'standalone', 'strength_sets', 4, 120),
('BLK-PCTL-3', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 3, 'C', 'standalone', 'strength_sets', 4, 120),
('BLK-PCTL-4', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 4, 'D', 'standalone', 'strength_sets', 3, 90),
('BLK-PCTL-5', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 5, 'E', 'standalone', 'strength_sets', 3, 90),
('BLK-PCTL-6', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 6, 'F', 'standalone', 'strength_sets', 3, 90),
('BLK-PCTL-7', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 7, 'G', 'standalone', 'strength_sets', 3, 90),
('BLK-PCTL-8', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 8, 'H', 'standalone', 'strength_sets', 3, 90),
('BLK-PCTL-9', 'W-PUSH-CHEST-TRI-LONG-1794830400000', 9, 'I', 'standalone', 'strength_sets', 3, 60);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, load_value) values
('BE-PCTL-1', 'BLK-PCTL-1', 'exercise', 'EX00282', 'Barbell Bench Press', 1, 'reps', '8', ''),
('BE-PCTL-2', 'BLK-PCTL-2', 'exercise', 'EX01236', 'Incline Dumbbell Bench Press', 1, 'reps', '10', ''),
('BE-PCTL-3', 'BLK-PCTL-3', 'exercise', 'EX00541', 'Close Grip Bench Press', 1, 'reps', '8', ''),
('BE-PCTL-4', 'BLK-PCTL-4', 'exercise', 'EX00753', 'Dumbbell Fly', 1, 'reps', '12', ''),
('BE-PCTL-5', 'BLK-PCTL-5', 'exercise', 'EX02871', 'Dumbbell Crush Press', 1, 'reps', '10', ''),
('BE-PCTL-6', 'BLK-PCTL-6', 'exercise', 'EX02349', 'Skull Crusher', 1, 'reps', '12', ''),
('BE-PCTL-7', 'BLK-PCTL-7', 'exercise', 'EX02000', 'Seated Overhead Dumbbell Tricep Extension', 1, 'reps', '12', ''),
('BE-PCTL-8', 'BLK-PCTL-8', 'exercise', 'EX00925', 'Feet Elevated Ring Push-Up', 1, 'reps', '12', ''),
('BE-PCTL-9', 'BLK-PCTL-9', 'exercise', 'EX00659', 'Diamond Push-Up', 1, 'reps', '15', '');
