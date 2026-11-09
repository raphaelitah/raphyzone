-- "Dual Russian Kettlebell Swing" is a two-bell exercise but was at implement_count = 1,
-- so the weight tile read "Xkg" instead of "Xkg each". The 20260915 backfill only
-- set 2 for names containing "dual kettlebell" / "dual kb", and "Russian" sits
-- between the words here, so this one was missed.
--
-- implement_count only drives the " each" label (ExerciseSpecRow.jsx,
-- WorkoutExecution.jsx); no weight is calculated from it.
update public.exercises
set implement_count = 2
where exercise_code = 'EX00716'
  and implement_count = 1;
