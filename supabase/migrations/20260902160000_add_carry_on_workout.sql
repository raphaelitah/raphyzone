-- Add "Carry On" - a 40 min AMRAP (target: 5 rounds), whichever comes first.
-- Introduces prescription_type = 'cal' for calorie-based steps (bike/row/ski);
-- previously calorie steps left prescription_type NULL with the count only in
-- notes/prescription_value free text.

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, ownership_type, status) values
('W-CARRYON-1788364767643', 'Carry On', 'Full Body', 'amrap', 'AMRAP', 'intermediate', 40,
  '["Bike","Row Erg","SkiErg","Kettlebell","Dumbbell","Plate"]'::jsonb, 'Mixed Conditioning', 'official', 'approved');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK-CARRYON-1788364767643', 'W-CARRYON-1788364767643', 1, 'A', 'circuit', 'amrap', 5, 2400);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, notes) values
('BE-CARRYON-1', 'BLK-CARRYON-1788364767643', 'exercise', 'EX00119', 'Assault Bike', 1, 'cal', '15', 'Target: 5 rounds'),
('BE-CARRYON-2', 'BLK-CARRYON-1788364767643', 'exercise', NULL, 'Farmers Carry', 2, 'distance', '80m', '32/24 kg | Target: 5 rounds'),
('BE-CARRYON-3', 'BLK-CARRYON-1788364767643', 'exercise', 'EX01910', 'Row', 3, 'cal', '15', 'Target: 5 rounds'),
('BE-CARRYON-4', 'BLK-CARRYON-1788364767643', 'exercise', NULL, 'Front Rack Carry', 4, 'distance', '80m', '20/12 kg | Target: 5 rounds'),
('BE-CARRYON-5', 'BLK-CARRYON-1788364767643', 'exercise', 'EX02341', 'Ski Erg', 5, 'cal', '15', 'Target: 5 rounds'),
('BE-CARRYON-6', 'BLK-CARRYON-1788364767643', 'exercise', NULL, 'Overhead Carry', 6, 'distance', '80m', '20kg / 10kg plate | Target: 5 rounds');
