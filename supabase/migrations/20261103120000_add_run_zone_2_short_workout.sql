-- Add "Run - Zone 2 (Short)": a 30 minute copy of "Run - Zone 2" (W-RUN-Z2-7dd1cf09).

insert into workouts (workout_id, name, workout_category, workout_format, format_label, difficulty, est_duration_min, equipment, modality, sub_modality, split, goal, ownership_type, status, is_free, notes) values
('W-RUN-Z2-SHORT-1793700000000', 'Run - Zone 2 (Short)', 'Conditioning', 'strength_sets', 'Conditioning', 'beginner', 30,
  '["Bodyweight"]'::jsonb, 'Cyclical / Monostructural', 'Running', 'Running', 'mixed', 'official', 'approved', false,
  'Maintain Zone 2 heart rate for the full 30 minutes. No distance target - time cap only.');

insert into workout_blocks (block_id, workout_id, order_index, block_label, block_type, workout_format, rounds, time_cap_sec) values
('BLK-RUN-Z2-SHORT-1793700000000', 'W-RUN-Z2-SHORT-1793700000000', 1, 'A', 'standalone', 'strength_sets', 1, 1800);

insert into block_exercises (block_exercise_id, block_id, step_type, exercise_id, exercise_title_raw, order_in_block, prescription_type, prescription_value, load_value) values
('BE-RUN-Z2-SHORT-1', 'BLK-RUN-Z2-SHORT-1793700000000', 'exercise', 'EX01914', 'Run', 1, 'time', '30 minutes', '');
