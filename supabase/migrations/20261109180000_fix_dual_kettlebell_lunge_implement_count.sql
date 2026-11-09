-- Three "Dual Kettlebell ... Lunge" exercises use two bells but were at
-- implement_count = 1, so the weight tile read "Xkg" instead of "Xkg each":
--   EX00705 Dual Kettlebell Front Rack Walking Lunges
--   EX00708 Dual Kettlebell Overhead Walking Lunge
--   EX00713 Dual Kettlebell Rack Drop Lunge
-- The 20260915 backfill only touched Bilateral exercises, and these are filed as
-- Unilateral (the legs alternate), so it skipped them.
--
-- implement_count only drives the " each" label (ExerciseSpecRow.jsx,
-- WorkoutExecution.jsx); no weight is calculated from it. All three are
-- dumbbell_substitutable, so a dumbbells-only athlete does the same exercise with
-- two dumbbells, which "each" already describes.
update public.exercises
set implement_count = 2
where exercise_code in ('EX00705', 'EX00708', 'EX00713')
  and implement_count = 1;
