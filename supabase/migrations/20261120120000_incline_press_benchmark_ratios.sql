-- Incline presses were tagged Horizontal Push with no benchmark override, so they
-- inherited the athlete's flat-press calibration 1:1 (e.g. incline barbell got the
-- same load as flat barbell; incline dumbbell got the flat barbell total per hand).
-- Ratios are relative to the flat press with the same implement; dumbbell variants
-- are additionally converted to per-hand in assignWorkoutWeights.

update public.exercises set benchmark_pattern = 'horizontal_push', benchmark_ratio = 0.78
where benchmark_pattern is null
  and name in ('Incline Barbell Bench Press', 'Pause Incline Bench Press', 'Multi Grip Incline Bench Press');

update public.exercises set benchmark_pattern = 'horizontal_push', benchmark_ratio = 0.72
where benchmark_pattern is null
  and name in ('Incline Close Grip Bench Press');

update public.exercises set benchmark_pattern = 'horizontal_push', benchmark_ratio = 0.85
where benchmark_pattern is null
  and name in ('Incline Dumbbell Bench Press');

update public.exercises set benchmark_pattern = 'horizontal_push', benchmark_ratio = 0.8
where benchmark_pattern is null
  and name in ('Incline Dumbbell Close Grip Bench Press', 'One and Quarter Incline Dumbbell Bench Press');
