-- 20260829120000_populate_empty_strength_workouts.sql set workout_format = 'strength_sets'
-- for W-CYC-RUN ("Easy Run") and W-RUN-Z2-7dd1cf09, and left their format_label
-- unset. Every other "Run ..." workout in the original dataset had
-- format_label = 'Conditioning' pre-populated, which is what the UI's
-- computeFormatLabel() also derives for any workout with "run" as a whole
-- word in its name (see src/lib/formatLabel.js). Without a stored
-- format_label, workout cards fall back to the raw workout_format and show
-- the literal string "strength_sets" instead. Backfill it here to match the
-- existing convention.
update workouts set format_label = 'Conditioning'
  where workout_id in ('W-CYC-RUN', 'W-RUN-Z2-7dd1cf09') and format_label is null;

-- W-MOB-YOGA ("Mobility Flow") was also given workout_format = 'strength_sets'
-- by the same migration, even though its block (BLK00296) is a 3-round
-- circuit, not a sets-based strength block. Correct both to 'circuit'.
update workout_blocks set workout_format = 'circuit'
  where block_id = 'BLK00296';

update workouts set workout_format = 'circuit', format_label = 'Circuit'
  where workout_id = 'W-MOB-YOGA';
