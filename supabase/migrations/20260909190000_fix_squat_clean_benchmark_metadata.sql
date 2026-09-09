-- Dumbbell/kettlebell squat-clean and squat-snatch movements are tagged
-- movement_pattern = 'Squat', which pulls the athlete's Barbell Back Squat
-- baseline directly — nonsensical for a squat-to-power-clean/snatch
-- movement, which loads far lighter than a max-effort squat. Same class of
-- bug as Dumbbell Devil Press, fixed via benchmark_pattern/benchmark_ratio
-- overrides in migration 20260909180000_add_exercise_benchmark_metadata.sql.
update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.6
where name in (
  'Dumbbell Squat Clean', 'Dumbbell Squat Snatch',
  'Dumbbell Clean to Goblet Squat', 'Kettlebell Clean to Goblet Squat'
);

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.5
where name in (
  'Dumbbell Squat Clean + Push Jerk', 'Dumbbell Squat Clean Thruster',
  'Kettlebell Squat Clean Thruster'
);

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.45
where name in ('Dumbbell Squat Clean + Split Jerk');

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.4
where name in ('Single Arm Kettlebell Clean + Cossack Squat');
