-- Popeye's note says "3 Rounds Without Breaking" but the block had no rounds
-- value, so it ran a single pass.

update workout_blocks
   set rounds = 3, updated_date = now()
 where block_id = 'BLK00367' and rounds is null;
