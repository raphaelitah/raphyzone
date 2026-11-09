-- A dumbbell swing is done with ONE dumbbell held in both hands, but American and
-- Russian Dumbbell Swing were at implement_count = 2 (the 20260915 backfill set 2
-- for every bilateral Dumbbell exercise except goblet/single-dumbbell ones). That
-- makes the active-workout weight tile read "Xkg each" for a single dumbbell.
--
-- implement_count only drives that " each" label (ExerciseSpecRow.jsx,
-- WorkoutExecution.jsx); no weight is calculated from it, so this changes no
-- assigned weight. Their kettlebell counterparts (swings, one bell) are already 1.
--
-- Deliberately NOT changed: Dumbbell Clean + Press, Dumbbell Hang Power Clean and
-- Dumbbell Hang Power Clean + Push Press stay at 2. They are two-dumbbell lifts,
-- so "each" is right even though their kettlebell counterparts use one bell.
update public.exercises
set implement_count = 1
where exercise_code in ('EX00088', 'EX01918')
  and implement_count = 2;
