-- Barbara ("5 rounds for time": pull-ups, push-ups, sit-ups, squats, then a
-- 3-minute rest before the next round) is stored as a circuit block with
-- rounds = 5 and its rest as a trailing block_exercises row (step_type =
-- 'rest', '3 minutes'), but nothing copied that rest onto the block itself.
-- workout_blocks.rest_seconds is what the athlete-facing circuit timer
-- (see isRotatingCircuitBlock in src/lib/workoutStructure.js) reads for the
-- pause between rounds, so without this the rest step was silently dropped.
update public.workout_blocks
set rest_seconds = 180
where block_id = 'BLK00268' and (rest_seconds is null or rest_seconds = 0);
