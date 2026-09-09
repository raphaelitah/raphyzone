-- Movement metadata for exercises whose working weight shouldn't be derived
-- 1:1 (or via the coarse MOVEMENT_PATTERN_FALLBACK ratio) from their tagged
-- movement_pattern's calibration benchmark. E.g. a Dumbbell Devil Press is
-- tagged movement_pattern = 'Vertical Push', which would pull the athlete's
-- Seated Dumbbell Press baseline directly — nonsensical for a full-body
-- burpee-to-snatch movement. benchmark_pattern/benchmark_ratio let an
-- individual exercise override that lookup with its own calibration source
-- and ratio; implement_count records how many implements are loaded at once
-- (for UI/validation — assignWorkoutWeights already normalizes calibration
-- baselines to a per-implement value before applying any ratio).
alter table public.exercises
  add column if not exists benchmark_pattern text,
  add column if not exists benchmark_ratio numeric,
  add column if not exists implement_count integer not null default 1;

comment on column public.exercises.benchmark_pattern is
  'Calibration pattern key (see src/lib/fitness.js CALIBRATION_PATTERNS) this exercise''s baseline should be derived from, overriding its own movement_pattern lookup. Null = use movement_pattern as normal.';
comment on column public.exercises.benchmark_ratio is
  'Fraction of the per-implement benchmark_pattern baseline used as this exercise''s baseline. Only meaningful when benchmark_pattern is set.';
comment on column public.exercises.implement_count is
  'Number of implements (dumbbells/kettlebells) loaded simultaneously for this exercise. 1 for unilateral/single-implement/barbell movements, 2 for bilateral dual-dumbbell/kettlebell movements.';

update public.exercises set implement_count = 2
where (equipment ilike '%dumbbell%' or equipment ilike '%kettlebell%')
  and laterality = 'Bilateral'
  and name in (
    'Dumbbell Devil Press', 'Kettlebell Devil Press', 'Dumbbell Thruster', 'Dumbbell Bear Complex',
    'American Dumbbell Swing', 'Russian Dumbbell Swing', 'Renegade Row', 'Dumbbell Marching Farmer Carry',
    'Dumbbell Turkish Get-Up', 'Kettlebell Thruster', 'Barbell Thruster'
  );

-- Full-body / complex movements misclassified under a strength-lift pattern
-- (Vertical Push, Hinge, Horizontal Pull) that overstates their true load —
-- redirect them to Olympic/Power at a lighter ratio, matching the fallback
-- already used for the generic 'Full Body Complex' movement_pattern bucket.
update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.65
where name in ('Dumbbell Devil Press');

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.6
where name in ('Kettlebell Devil Press', 'Dumbbell Bear Complex');

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.7
where name in ('Alternating Dumbbell Thruster');

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.75
where name in ('Single Arm Dumbbell Thruster');

update public.exercises set benchmark_pattern = 'olympic_power', benchmark_ratio = 0.35
where name in ('Dumbbell Turkish Get-Up');

update public.exercises set benchmark_pattern = 'hinge', benchmark_ratio = 0.35
where name in ('American Dumbbell Swing', 'Russian Dumbbell Swing');

update public.exercises set benchmark_pattern = 'horizontal_pull', benchmark_ratio = 0.5
where name in ('Renegade Row');

update public.exercises set benchmark_pattern = 'horizontal_pull', benchmark_ratio = 0.65
where name in ('Single Arm Renegade Row');

update public.exercises set benchmark_pattern = 'hinge', benchmark_ratio = 0.4
where name in ('Dumbbell Marching Farmer Carry');
