-- Add "Pull Volume" - pull-biased hypertrophy + endurance day: warm-up circuit (A0),
-- assisted pull-ups, bent over DB row, lat pulldown, face pulls and a technique + core
-- circuit finisher.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, ownership_type, status, notes) values
('W-PULLVOLUME-1794405600000', 'Pull Volume', 'Upper Body', 'strength_sets', 'Strength', 'intermediate', 50,
  '["Pull-Up Bar","Cable / Machine","Dumbbell","Rings / TRX","Resistance Band","Bodyweight"]'::jsonb, 'Strength / Muscular Endurance', 'official', 'approved',
  'Volume + skill day (hypertrophy + endurance). Pull-ups: pronated or neutral grip.');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec, time_cap_sec) values
('BLK-PULLVOLUME-A0-1794405600000', 'W-PULLVOLUME-1794405600000', 1, 'A0', 'circuit',    'circuit',       1, null, null),
('BLK-PULLVOLUME-A-1794405600000',  'W-PULLVOLUME-1794405600000', 2, 'A',  'standalone', 'strength_sets', 4, 90,   null),
('BLK-PULLVOLUME-B-1794405600000',  'W-PULLVOLUME-1794405600000', 3, 'B',  'standalone', 'strength_sets', 4, 90,   null),
('BLK-PULLVOLUME-C-1794405600000',  'W-PULLVOLUME-1794405600000', 4, 'C',  'standalone', 'strength_sets', 3, 90,   null),
('BLK-PULLVOLUME-D-1794405600000',  'W-PULLVOLUME-1794405600000', 5, 'D',  'standalone', 'strength_sets', 3, 60,   null),
('BLK-PULLVOLUME-E-1794405600000',  'W-PULLVOLUME-1794405600000', 6, 'E',  'circuit',    'circuit',       3, 75,   null);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE-PULLVOLUME-1',  'BLK-PULLVOLUME-A0-1794405600000', 'exercise', 'EX01668', 'Passive Hang',           1, 'time', '20-30 seconds', 'Warm-up circuit | 1 set'),
('BE-PULLVOLUME-2',  'BLK-PULLVOLUME-A0-1794405600000', 'exercise', 'EX01947', 'Scapular Pull-Up',       2, 'reps', '8-10',          'Warm-up circuit | 1 set'),
('BE-PULLVOLUME-3',  'BLK-PULLVOLUME-A0-1794405600000', 'exercise', 'EX01874', 'Ring Face Pull',         3, 'reps', '15',            'Warm-up circuit | 1 set'),
('BE-PULLVOLUME-4',  'BLK-PULLVOLUME-A-1794405600000',  'exercise', 'EX01762', 'Pronated Pull-Up',       1, 'reps', '8',             '4 sets x 8 reps | Assisted (pronated or neutral grip) | Full ROM, 1 sec pause at bottom | Rest: 90 sec'),
('BE-PULLVOLUME-5',  'BLK-PULLVOLUME-B-1794405600000',  'exercise', 'EX00362', 'Bent Over Dumbbell Row', 1, 'reps', '10',            '4 sets x 10 reps | Volume | Strict form, no torso twisting | Rest: 90 sec'),
('BE-PULLVOLUME-6',  'BLK-PULLVOLUME-C-1794405600000',  'exercise', 'EX01443', 'Lat Pulldown',           1, 'reps', '12',            '3 sets x 12 reps | Volume, slow and controlled | Rest: 90 sec'),
('BE-PULLVOLUME-7',  'BLK-PULLVOLUME-D-1794405600000',  'exercise', 'EX01874', 'Ring Face Pull',         1, 'reps', '15',            '3 sets x 15 reps | Rest: 60 sec'),
('BE-PULLVOLUME-8',  'BLK-PULLVOLUME-E-1794405600000',  'exercise', 'EX01668', 'Passive Hang',           1, 'time', '20 seconds',    'Technique + core circuit | 3 rounds | Rest 60-90 sec between rounds'),
('BE-PULLVOLUME-9',  'BLK-PULLVOLUME-E-1794405600000',  'exercise', 'EX00050', 'Active Hollow Hold',     2, 'time', '20 seconds',    'Technique + core circuit | 3 rounds | Rest 60-90 sec between rounds'),
('BE-PULLVOLUME-10', 'BLK-PULLVOLUME-E-1794405600000',  'exercise', 'EX01154', 'Hanging Knee Raise',     3, 'reps', '8-10',          'Technique + core circuit | 3 rounds | Rest 60-90 sec between rounds');
