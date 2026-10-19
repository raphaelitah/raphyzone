-- 40' Calisthenics block A was "For time, 10 each - 35 mins" repeated on every
-- exercise, with no rounds and no time cap, so it ran a single pass. Make it a
-- 35-min AMRAP (time_cap_sec = 2100) and keep the instruction once, at workout level.

update workout_blocks
   set workout_format = 'amrap', time_cap_sec = 2100, updated_date = now()
 where block_id = 'BLK00058';

update block_exercises
   set notes = null
 where block_id = 'BLK00058' and notes = 'For time, 10 each - 35 mins';

update workouts
   set notes = 'Block A: repeat the circuit (10 reps of each) for 35 minutes. Then block B: 5 rounds of 15 crunches.',
       updated_date = now()
 where workout_id = (select workout_id from workout_blocks where block_id = 'BLK00058');
