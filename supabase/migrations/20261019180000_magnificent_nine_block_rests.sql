-- Magnificent Nine: 3 minutes rest between the three 12-min AMRAP blocks.
-- WorkoutExecution's startInterBlockRest() reads rest_between_rounds_sec off the
-- block that just finished (same approach as Asgard Strength), so it goes on A and B;
-- C is the last block, where it would be a no-op. A rest step inside an AMRAP block
-- would repeat every round instead.

update workout_blocks
   set rest_between_rounds_sec = 180, updated_date = now()
 where block_id in ('BLK00111', 'BLK00112');
