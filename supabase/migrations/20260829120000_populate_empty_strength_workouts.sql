-- Populate workout_blocks / block_exercises for workouts that had no
-- normalized structure (only a legacy `exercises` jsonb column), which made
-- them render as "This workout doesn't have any exercises set up yet."
-- Affected: W-STR-PUSH, W-STR-PULL, W-STR-LEGS, W-COND-METCON, W-CYC-RUN,
-- W-MOB-YOGA.
-- Note: W-RUN-Z2-7dd1cf09 was initially suspected but already had a valid
-- block/exercise (BLK00277/BE00614) - excluded here, only its workout-level
-- metadata (difficulty/equipment) is backfilled below.

-- Push Strength A
insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK00278', 'W-STR-PUSH', 1, 'A', 'standalone', 'strength_sets', 4, null),
('BLK00279', 'W-STR-PUSH', 2, 'B', 'standalone', 'strength_sets', 4, null),
('BLK00280', 'W-STR-PUSH', 3, 'C', 'standalone', 'strength_sets', 3, null),
('BLK00281', 'W-STR-PUSH', 4, 'D', 'standalone', 'strength_sets', 3, null),
('BLK00282', 'W-STR-PUSH', 5, 'E', 'standalone', 'strength_sets', 3, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE00615', 'BLK00278', 'exercise', 'EX00282', 'Barbell Bench Press', 1, 'reps', '8', '4 sets x 8 reps'),
('BE00616', 'BLK00279', 'exercise', 'EX01966', 'Seated Barbell Press', 1, 'reps', '8', '4 sets x 8 reps'),
('BE00617', 'BLK00280', 'exercise', 'EX01236', 'Incline Dumbbell Bench Press', 1, 'reps', '10', '3 sets x 10 reps'),
('BE00618', 'BLK00281', 'exercise', 'EX00481', 'Cable Tricep Pushdown with Straight Bar', 1, 'reps', '12', '3 sets x 12 reps'),
('BE00619', 'BLK00282', 'exercise', 'EX00788', 'Dumbbell Lateral Raise', 1, 'reps', '15', '3 sets x 15 reps');

-- Pull Strength A
insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK00283', 'W-STR-PULL', 1, 'A', 'standalone', 'strength_sets', 4, null),
('BLK00284', 'W-STR-PULL', 2, 'B', 'standalone', 'strength_sets', 4, null),
('BLK00285', 'W-STR-PULL', 3, 'C', 'standalone', 'strength_sets', 3, null),
('BLK00286', 'W-STR-PULL', 4, 'D', 'standalone', 'strength_sets', 3, null),
('BLK00287', 'W-STR-PULL', 5, 'E', 'standalone', 'strength_sets', 3, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE00620', 'BLK00283', 'exercise', 'EX00358', 'Bent Over Barbell Row', 1, 'reps', '8', '4 sets x 8 reps'),
('BE00621', 'BLK00284', 'exercise', 'EX01443', 'Lat Pulldown', 1, 'reps', '10', '4 sets x 10 reps'),
('BE00622', 'BLK00285', 'exercise', 'EX02008', 'Seated Row Machine', 1, 'reps', '10', '3 sets x 10 reps'),
('BE00623', 'BLK00286', 'exercise', 'EX00729', 'Dumbbell Bicep Curl', 1, 'reps', '12', '3 sets x 12 reps'),
('BE00624', 'BLK00287', 'exercise', 'EX01874', 'Ring Face Pull', 1, 'reps', '15', '3 sets x 15 reps');

-- Leg Strength A
insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK00288', 'W-STR-LEGS', 1, 'A', 'standalone', 'strength_sets', 4, null),
('BLK00289', 'W-STR-LEGS', 2, 'B', 'standalone', 'strength_sets', 4, null),
('BLK00290', 'W-STR-LEGS', 3, 'C', 'standalone', 'strength_sets', 3, null),
('BLK00291', 'W-STR-LEGS', 4, 'D', 'standalone', 'strength_sets', 3, null),
('BLK00292', 'W-STR-LEGS', 5, 'E', 'standalone', 'strength_sets', 3, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE00625', 'BLK00288', 'exercise', 'EX00152', 'Back Squat', 1, 'reps', '8', '4 sets x 8 reps'),
('BE00626', 'BLK00289', 'exercise', 'EX01468', 'Leg Press', 1, 'reps', '10', '4 sets x 10 reps'),
('BE00627', 'BLK00290', 'exercise', 'EX01906', 'Romanian Deadlift', 1, 'reps', '10', '3 sets x 10 reps'),
('BE00628', 'BLK00291', 'exercise', 'EX00850', 'Dumbbell Walking Lunge', 1, 'reps', '12', '3 sets x 12 reps per leg'),
('BE00629', 'BLK00292', 'exercise', 'EX02462', 'Standing Calf Raise', 1, 'reps', '15', '3 sets x 15 reps');

-- Full Body Metcon (AMRAP circuit)
insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK00293', 'W-COND-METCON', 1, 'A', 'circuit', 'amrap', 15, 2700);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE00630', 'BLK00293', 'exercise', 'EX00089', 'American Kettlebell Swing', 1, 'reps', '15', 'AMRAP 45 minutes'),
('BE00631', 'BLK00293', 'exercise', 'EX00432', 'Burpee', 2, 'reps', '12', 'AMRAP 45 minutes'),
('BE00632', 'BLK00293', 'exercise', 'EX00059', 'Air Squat', 3, 'reps', '20', 'AMRAP 45 minutes'),
('BE00633', 'BLK00293', 'exercise', 'EX01544', 'Mountain Climber', 4, 'reps', '20', 'AMRAP 45 minutes'),
('BE00634', 'BLK00293', 'exercise', 'EX00965', 'Forearm Plank', 5, 'time', '30 seconds', 'AMRAP 45 minutes');

-- Easy Run (duration-based)
insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK00294', 'W-CYC-RUN', 1, 'A', 'standalone', 'strength_sets', null, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE00635', 'BLK00294', 'exercise', 'EX01914', 'Run', 1, 'time', '45 minutes', 'Conversational-pace easy run. Include a 5 minute walk to warm up and a 5 minute walk to cool down within the session.');

-- Mobility Flow (duration-based circuit, repeated for total volume)
insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK00296', 'W-MOB-YOGA', 1, 'A', 'circuit', 'strength_sets', 3, null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE00637', 'BLK00296', 'exercise', 'EX00114', 'Arm Hug', 1, 'time', '3 minutes', '3 rounds through the flow'),
('BE00638', 'BLK00296', 'exercise', 'EX00052', 'Active Pigeon', 2, 'time', '3 minutes', '3 rounds through the flow'),
('BE00639', 'BLK00296', 'exercise', 'EX00040', '90/90 Internal Rotation Stretch', 3, 'time', '3 minutes', '3 rounds through the flow'),
('BE00640', 'BLK00296', 'exercise', 'EX00123', 'Assisted Front Split Stretch', 4, 'time', '3 minutes', '3 rounds through the flow'),
('BE00641', 'BLK00296', 'exercise', 'EX00097', 'Anterior Pathway Stretch', 5, 'time', '3 minutes', '3 rounds through the flow');

-- Backfill workout-level metadata (difficulty, equipment, est_duration_min, format)
update workouts set difficulty = 'beginner', workout_format = 'strength_sets', est_duration_min = 48,
  equipment = '["Barbell","Bench / Box","Dumbbell","Cable / Machine"]'::jsonb
  where workout_id = 'W-STR-PUSH';

update workouts set difficulty = 'beginner', workout_format = 'strength_sets', est_duration_min = 48,
  equipment = '["Barbell","Cable / Machine","Dumbbell","Rings / TRX"]'::jsonb
  where workout_id = 'W-STR-PULL';

update workouts set difficulty = 'beginner', workout_format = 'strength_sets', est_duration_min = 48,
  equipment = '["Barbell","Cable / Machine","Dumbbell"]'::jsonb
  where workout_id = 'W-STR-LEGS';

update workouts set difficulty = 'beginner', workout_format = 'amrap', est_duration_min = 45,
  equipment = '["Kettlebell","Bodyweight"]'::jsonb
  where workout_id = 'W-COND-METCON';

update workouts set difficulty = 'beginner', workout_format = 'strength_sets', est_duration_min = 45,
  equipment = '["Bodyweight"]'::jsonb
  where workout_id = 'W-CYC-RUN';

update workouts set difficulty = 'beginner', workout_format = 'strength_sets', est_duration_min = 60,
  equipment = '["Bodyweight"]'::jsonb
  where workout_id = 'W-RUN-Z2-7dd1cf09';

update workouts set difficulty = 'beginner', workout_format = 'strength_sets', est_duration_min = 45,
  equipment = '["Bodyweight"]'::jsonb
  where workout_id = 'W-MOB-YOGA';
