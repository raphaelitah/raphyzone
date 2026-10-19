-- The Ghost: 6 rounds of Row / Burpee / Double Unders / Rest, 1 minute each, scored on
-- total reps (calories on the row). The block had no rounds and no step prescriptions,
-- with the scheme only as free text repeated on every step, so it ran a single pass.

update workout_blocks
   set rounds = 6, updated_date = now()
 where block_id = 'BLK00370' and rounds is null;

update block_exercises
   set prescription_type = 'time', prescription_value = '1 minute', updated_date = now()
 where block_id = 'BLK00370' and step_type = 'exercise' and prescription_type is null;

update block_exercises
   set notes = case exercise_title_raw when 'Row' then 'Score: calories' else 'Score: reps' end,
       updated_date = now()
 where block_id = 'BLK00370' and step_type = 'exercise';

update block_exercises
   set notes = null, updated_date = now()
 where block_id = 'BLK00370' and step_type = 'rest';

update workouts
   set notes = '6 rounds: 1 minute each of Row, Burpees and Double Unders, then 1 minute rest. Score is total reps (calories on the row).',
       updated_date = now()
 where workout_id = (select workout_id from workout_blocks where block_id = 'BLK00370');
