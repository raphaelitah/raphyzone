-- The squat-clean/snatch movements added in
-- 20260909190000_fix_squat_clean_benchmark_metadata.sql were missed by the
-- original implement_count backfill in
-- 20260909180000_add_exercise_benchmark_metadata.sql, so the bilateral
-- dual-dumbbell/kettlebell ones among them still show a per-implement
-- suggested weight without the "each" qualifier. Single Arm Kettlebell
-- Clean + Cossack Squat is intentionally excluded — it loads one implement.
update public.exercises set implement_count = 2
where (equipment ilike '%dumbbell%' or equipment ilike '%kettlebell%')
  and laterality = 'Bilateral'
  and name in (
    'Dumbbell Squat Clean', 'Dumbbell Squat Snatch',
    'Dumbbell Clean to Goblet Squat', 'Kettlebell Clean to Goblet Squat',
    'Dumbbell Squat Clean + Push Jerk', 'Dumbbell Squat Clean Thruster',
    'Kettlebell Squat Clean Thruster', 'Dumbbell Squat Clean + Split Jerk'
  );
