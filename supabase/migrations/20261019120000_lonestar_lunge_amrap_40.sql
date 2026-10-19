-- Lonestar Lunge was meant to be "repeat the circuit until 40 minutes is up",
-- but was stored as a plain circuit with no rounds and no time cap, so it ran
-- one pass (~4 min). Model it like Carry On: an AMRAP block with
-- time_cap_sec = 2400 (the cap is the ground truth for duration).

update workouts
   set workout_format = 'amrap', format_label = 'AMRAP', notes = 'AMRAP 40 minutes',
       updated_date = now()
 where workout_id = '6a8b5ff82f65fc56923ecc90';

update workout_blocks
   set workout_format = 'amrap', time_cap_sec = 2400, updated_date = now()
 where block_id = 'BLK00063';

update block_exercises
   set notes = 'AMRAP 40 minutes'
 where block_id = 'BLK00063' and notes = 'For time: 40 mins';
