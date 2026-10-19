-- Magnificent Nine (A-C), leg day (D), Lower Body Day (D) and Upper Push / Pull (D)
-- had "N min AMRAP" only as free text repeated on every exercise, with no time cap,
-- so each block ran a single pass. Model them as AMRAP blocks with time_cap_sec and
-- keep the instruction once, in the workout notes. Same fix as Lonestar Lunge /
-- 40' Calisthenics.

update workout_blocks
   set workout_format = 'amrap', time_cap_sec = 720, updated_date = now()
 where block_id in ('BLK00111', 'BLK00112', 'BLK00113');   -- Magnificent Nine: 12 min each

update workout_blocks
   set workout_format = 'amrap', time_cap_sec = 900, updated_date = now()
 where block_id = 'BLK00089';                              -- leg day D: 15 min

update workout_blocks
   set workout_format = 'amrap', time_cap_sec = 480, updated_date = now()
 where block_id = 'BLK00077';                              -- Lower Body Day D: 8 min

-- Upper Push / Pull D also carried rounds = 4 and a 90s round rest, which
-- contradict an AMRAP.
update workout_blocks
   set workout_format = 'amrap', time_cap_sec = 600, rounds = null,
       rest_between_rounds_sec = null, updated_date = now()
 where block_id = 'BLK00067';                              -- Upper Push / Pull D: 10 min

-- Drop the repeated "N min AMRAP" prefix from exercise notes; keep any
-- exercise-specific remainder.
update block_exercises
   set notes = nullif(regexp_replace(notes, '^(12min AMRAP - 3 min rest|15min AMRAP|10min AMRAP|8 min amrap - 6 rds \+ target)( - )?', ''), '')
 where block_id in ('BLK00111', 'BLK00112', 'BLK00113', 'BLK00089', 'BLK00077', 'BLK00067');

-- Block A's first exercise also had blocks B/C pasted into its note.
update block_exercises
   set notes = null
 where block_id = 'BLK00111' and order_in_block = 1;

update workouts set updated_date = now(), notes = 'Blocks A, B and C are each a 12-minute AMRAP, with 3 minutes rest between blocks.'
 where workout_id = (select workout_id from workout_blocks where block_id = 'BLK00111');

update workouts set updated_date = now(), notes = 'Block D: 15-minute AMRAP.'
 where workout_id = (select workout_id from workout_blocks where block_id = 'BLK00089');

update workouts set updated_date = now(), notes = 'Block D: 8-minute AMRAP. Target: 6+ rounds.'
 where workout_id = (select workout_id from workout_blocks where block_id = 'BLK00077');

update workouts set updated_date = now(), notes = 'Block D: 10-minute AMRAP.'
 where workout_id = (select workout_id from workout_blocks where block_id = 'BLK00067');
