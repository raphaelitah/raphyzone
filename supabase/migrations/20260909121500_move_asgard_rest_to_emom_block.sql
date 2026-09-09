-- Asgard Strength's 3-minute rest (EMOM, then rest, then AMRAP) was stored as
-- rest_between_rounds_sec = 180 on BLK00310 (the AMRAP block, order 2), but
-- WorkoutExecution's startInterBlockRest() reads that value off the block
-- that just FINISHED to decide how long to rest before the next block — and
-- it never fires after the last block in a workout. Sitting on BLK00310
-- (the last block) meant it was a no-op. It belongs on BLK00309 (the EMOM,
-- order 1), whose completion is what the rest should actually follow.
update public.workout_blocks
set rest_between_rounds_sec = 180
where block_id = 'BLK00309';

update public.workout_blocks
set rest_between_rounds_sec = null
where block_id = 'BLK00310';
