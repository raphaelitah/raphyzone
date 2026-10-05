-- Bodyweight exercises (requires_load = false) showed a "Dumbbells N kg" note that
-- contradicted the Bodyweight spec. The rest of each note only repeated sets x reps.
update block_exercises be
set notes = null
from exercises e
where e.exercise_code = be.exercise_id
  and e.requires_load = false
  and be.notes ~* '^(.*- )?Dumbbells \d+ kg';
