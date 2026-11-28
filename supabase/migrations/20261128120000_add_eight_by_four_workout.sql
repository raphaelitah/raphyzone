-- Add "Eight by Four" - 8 rounds, one every 4 minutes with a 3 minute cap, alternating
-- a row round (ending in dumbbell reverse lunges) and a ski round (ending in wall balls).
-- One block per round so each carries its own cap and the 60s rest that follows it.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, ownership_type, status, notes) values
('W-EIGHTBYFOUR-1795824000000', 'Eight by Four', 'Full Body', 'for_time', 'For Time', 'intermediate', 32,
  '["Rower","SkiErg","Dumbbell","Weight Plates","Medicine Ball"]'::jsonb, 'Mixed Conditioning', 'official', 'approved',
  '8 rounds, one every 4 minutes, 3 minute cap per round. Odd rounds row, even rounds ski. Rest whatever is left of the 4 minutes.');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, rest_between_rounds_sec, time_cap_sec) values
('BLK-EIGHTBYFOUR-A-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 1, 'A', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-B-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 2, 'B', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-C-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 3, 'C', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-D-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 4, 'D', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-E-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 5, 'E', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-F-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 6, 'F', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-G-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 7, 'G', 'circuit', 'for_time', 1, 60, 180),
('BLK-EIGHTBYFOUR-H-1795824000000', 'W-EIGHTBYFOUR-1795824000000', 8, 'H', 'circuit', 'for_time', 1, null, 180);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE-EIGHTBYFOUR-1', 'BLK-EIGHTBYFOUR-A-1795824000000', 'exercise', 'EX01910', 'Row', 1, 'cal', '11', 'Round 1 of 8 | 3 min cap | Next round starts at 4:00'),
('BE-EIGHTBYFOUR-2', 'BLK-EIGHTBYFOUR-A-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 1 of 8 | 3 min cap | Next round starts at 4:00'),
('BE-EIGHTBYFOUR-3', 'BLK-EIGHTBYFOUR-A-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 1 of 8 | 3 min cap | Next round starts at 4:00'),
('BE-EIGHTBYFOUR-4', 'BLK-EIGHTBYFOUR-A-1795824000000', 'exercise', 'EX00803', 'Dumbbell Reverse Lunge', 4, 'reps', '20', 'Round 1 of 8 | 3 min cap | Next round starts at 4:00'),
('BE-EIGHTBYFOUR-5', 'BLK-EIGHTBYFOUR-B-1795824000000', 'exercise', 'EX02341', 'Ski Erg', 1, 'cal', '11', 'Round 2 of 8 | 3 min cap | Next round starts at 8:00'),
('BE-EIGHTBYFOUR-6', 'BLK-EIGHTBYFOUR-B-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 2 of 8 | 3 min cap | Next round starts at 8:00'),
('BE-EIGHTBYFOUR-7', 'BLK-EIGHTBYFOUR-B-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 2 of 8 | 3 min cap | Next round starts at 8:00'),
('BE-EIGHTBYFOUR-8', 'BLK-EIGHTBYFOUR-B-1795824000000', 'exercise', 'EX02781', 'Wall Ball', 4, 'reps', '20', 'Round 2 of 8 | 3 min cap | Next round starts at 8:00'),
('BE-EIGHTBYFOUR-9', 'BLK-EIGHTBYFOUR-C-1795824000000', 'exercise', 'EX01910', 'Row', 1, 'cal', '11', 'Round 3 of 8 | 3 min cap | Next round starts at 12:00'),
('BE-EIGHTBYFOUR-10', 'BLK-EIGHTBYFOUR-C-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 3 of 8 | 3 min cap | Next round starts at 12:00'),
('BE-EIGHTBYFOUR-11', 'BLK-EIGHTBYFOUR-C-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 3 of 8 | 3 min cap | Next round starts at 12:00'),
('BE-EIGHTBYFOUR-12', 'BLK-EIGHTBYFOUR-C-1795824000000', 'exercise', 'EX00803', 'Dumbbell Reverse Lunge', 4, 'reps', '20', 'Round 3 of 8 | 3 min cap | Next round starts at 12:00'),
('BE-EIGHTBYFOUR-13', 'BLK-EIGHTBYFOUR-D-1795824000000', 'exercise', 'EX02341', 'Ski Erg', 1, 'cal', '11', 'Round 4 of 8 | 3 min cap | Next round starts at 16:00'),
('BE-EIGHTBYFOUR-14', 'BLK-EIGHTBYFOUR-D-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 4 of 8 | 3 min cap | Next round starts at 16:00'),
('BE-EIGHTBYFOUR-15', 'BLK-EIGHTBYFOUR-D-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 4 of 8 | 3 min cap | Next round starts at 16:00'),
('BE-EIGHTBYFOUR-16', 'BLK-EIGHTBYFOUR-D-1795824000000', 'exercise', 'EX02781', 'Wall Ball', 4, 'reps', '20', 'Round 4 of 8 | 3 min cap | Next round starts at 16:00'),
('BE-EIGHTBYFOUR-17', 'BLK-EIGHTBYFOUR-E-1795824000000', 'exercise', 'EX01910', 'Row', 1, 'cal', '11', 'Round 5 of 8 | 3 min cap | Next round starts at 20:00'),
('BE-EIGHTBYFOUR-18', 'BLK-EIGHTBYFOUR-E-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 5 of 8 | 3 min cap | Next round starts at 20:00'),
('BE-EIGHTBYFOUR-19', 'BLK-EIGHTBYFOUR-E-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 5 of 8 | 3 min cap | Next round starts at 20:00'),
('BE-EIGHTBYFOUR-20', 'BLK-EIGHTBYFOUR-E-1795824000000', 'exercise', 'EX00803', 'Dumbbell Reverse Lunge', 4, 'reps', '20', 'Round 5 of 8 | 3 min cap | Next round starts at 20:00'),
('BE-EIGHTBYFOUR-21', 'BLK-EIGHTBYFOUR-F-1795824000000', 'exercise', 'EX02341', 'Ski Erg', 1, 'cal', '11', 'Round 6 of 8 | 3 min cap | Next round starts at 24:00'),
('BE-EIGHTBYFOUR-22', 'BLK-EIGHTBYFOUR-F-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 6 of 8 | 3 min cap | Next round starts at 24:00'),
('BE-EIGHTBYFOUR-23', 'BLK-EIGHTBYFOUR-F-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 6 of 8 | 3 min cap | Next round starts at 24:00'),
('BE-EIGHTBYFOUR-24', 'BLK-EIGHTBYFOUR-F-1795824000000', 'exercise', 'EX02781', 'Wall Ball', 4, 'reps', '20', 'Round 6 of 8 | 3 min cap | Next round starts at 24:00'),
('BE-EIGHTBYFOUR-25', 'BLK-EIGHTBYFOUR-G-1795824000000', 'exercise', 'EX01910', 'Row', 1, 'cal', '11', 'Round 7 of 8 | 3 min cap | Next round starts at 28:00'),
('BE-EIGHTBYFOUR-26', 'BLK-EIGHTBYFOUR-G-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 7 of 8 | 3 min cap | Next round starts at 28:00'),
('BE-EIGHTBYFOUR-27', 'BLK-EIGHTBYFOUR-G-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 7 of 8 | 3 min cap | Next round starts at 28:00'),
('BE-EIGHTBYFOUR-28', 'BLK-EIGHTBYFOUR-G-1795824000000', 'exercise', 'EX00803', 'Dumbbell Reverse Lunge', 4, 'reps', '20', 'Round 7 of 8 | 3 min cap | Next round starts at 28:00'),
('BE-EIGHTBYFOUR-29', 'BLK-EIGHTBYFOUR-H-1795824000000', 'exercise', 'EX02341', 'Ski Erg', 1, 'cal', '11', 'Round 8 of 8 | 3 min cap'),
('BE-EIGHTBYFOUR-30', 'BLK-EIGHTBYFOUR-H-1795824000000', 'exercise', 'EX02907', 'Single Arm Dumbbell Snatch', 2, 'reps', '16', 'Round 8 of 8 | 3 min cap'),
('BE-EIGHTBYFOUR-31', 'BLK-EIGHTBYFOUR-H-1795824000000', 'exercise', 'EX00448', 'Burpee to Plate', 3, 'reps', '8', 'Round 8 of 8 | 3 min cap'),
('BE-EIGHTBYFOUR-32', 'BLK-EIGHTBYFOUR-H-1795824000000', 'exercise', 'EX02781', 'Wall Ball', 4, 'reps', '20', 'Round 8 of 8 | 3 min cap');
