-- Normalize workout_blocks.block_type / workout_format to the canonical lists
-- used by the BlockEditor dropdowns (src/lib/blockOptions.js).

-- Mikko's Triangle was converted to a tabata but kept its old EMOM type.
update public.workout_blocks set block_type = 'tabata' where block_id = 'BLK00170';

-- Case variants.
update public.workout_blocks set block_type = lower(block_type) where block_type <> lower(block_type);

-- Superset block with no format.
update public.workout_blocks set workout_format = 'superset'
 where workout_format is null and block_type = 'superset';

-- CreateWorkoutSheet used to write 'main'; a single-block workout is 'standalone'.
update public.workout_blocks set block_type = 'standalone' where block_type = 'main';
