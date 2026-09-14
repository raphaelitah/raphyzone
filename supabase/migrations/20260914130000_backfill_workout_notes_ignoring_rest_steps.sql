-- Same backfill as the prior migration, but this time considering only
-- non-rest steps when checking for a shared exercise-level note. Some
-- workouts (e.g. "Fight Gone Bad", "Mikko's Triangle") have every real
-- exercise carrying the same note while their rest step has none, so they
-- didn't qualify under the stricter "every step matches" rule.
with shared as (
  select
    w.workout_id,
    min(be.notes) as shared_note
  from workouts w
  join workout_blocks wb on wb.workout_id = w.workout_id
  join block_exercises be on be.block_id = wb.block_id
  where be.step_type <> 'rest'
  group by w.workout_id
  having count(distinct be.notes) filter (where be.notes is not null) = 1
     and count(be.notes) filter (where be.notes is not null) = count(*)
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
  where be.step_type <> 'rest'
  group by w.workout_id
  having count(distinct be.notes) filter (where be.notes is not null) = 1
     and count(be.notes) filter (where be.notes is not null) = count(*)
)
update block_exercises be
set notes = null,
    updated_date = now()
from workout_blocks wb, shared
where be.block_id = wb.block_id
  and wb.workout_id = shared.workout_id
  and be.step_type <> 'rest'
  and be.notes is not null;
