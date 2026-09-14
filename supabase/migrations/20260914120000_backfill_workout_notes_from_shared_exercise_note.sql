-- Backfill workouts.notes from the shared exercise-level note when every
-- exercise in the workout carries the same non-null note (e.g. "AMRAP 45
-- minutes", "For Time"), then drop that now-redundant note off the
-- individual exercises since it lives at the workout level going forward.
with shared as (
  select
    w.workout_id,
    min(be.notes) as shared_note
  from workouts w
  join workout_blocks wb on wb.workout_id = w.workout_id
  join block_exercises be on be.block_id = wb.block_id
  group by w.workout_id
  having count(distinct be.notes) filter (where be.notes is not null) = 1
     and count(be.notes) filter (where be.notes is not null) = count(be.*)
)
update workouts w
set notes = shared.shared_note,
    updated_date = now()
from shared
where w.workout_id = shared.workout_id
  and w.notes is null;

with shared as (
  select
    w.workout_id
  from workouts w
  join workout_blocks wb on wb.workout_id = w.workout_id
  join block_exercises be on be.block_id = wb.block_id
  group by w.workout_id
  having count(distinct be.notes) filter (where be.notes is not null) = 1
     and count(be.notes) filter (where be.notes is not null) = count(be.*)
)
update block_exercises be
set notes = null,
    updated_date = now()
from workout_blocks wb, shared
where be.block_id = wb.block_id
  and wb.workout_id = shared.workout_id
  and be.notes is not null;
