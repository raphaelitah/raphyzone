-- Fixes exercise rows whose movement_pattern/primary_muscle_group/secondary_muscle_group
-- were mislabeled in the original bulk import (scripts/migration/steps/*_exercises_*.sql),
-- causing the "Substitute exercise" feature (requestSubstitute in WorkoutExecution.jsx) to
-- suggest completely unrelated exercises with high confidence -- e.g. "Leg Press" was
-- tagged movement_pattern='Vertical Push' / primary_muscle_group='Shoulders', so it
-- shortlisted "Strict Press" as a 95% match.
--
-- Each fix below was verified by comparing against the exercise's correctly-labeled
-- siblings (e.g. dozens of other "Pull-Up" rows are all Back / Lats + Vertical Pull;
-- only "Butterfly Pull-Up" and "Butterfly Chest to Bar Pull Up" were outliers).

-- Leg press family: was Vertical Push / Shoulders / Triceps or Horizontal Pull / Back / Lats.
update public.exercises
set movement_pattern = 'Squat',
    primary_muscle_group = 'Quadriceps',
    secondary_muscle_group = 'Glutes'
where name in (
  'Leg Press',
  'Wide Stance Leg Press',
  'Single Leg Leg Press',
  'Narrow Stance Leg Press',
  'Narrow Stance Incline Leg Press'
);

-- Tricep extensions mislabeled as Mobility / Glutes.
update public.exercises
set movement_pattern = 'Elbow Extension',
    primary_muscle_group = 'Triceps',
    secondary_muscle_group = null
where name in (
  '90/90 Crush Grip Dumbbell Tricep Extension',
  '90/90 Supine Kettebell Horn Tricep Extension'
);

-- Bicep curl mislabeled as Core - Rotation / Core.
update public.exercises
set movement_pattern = 'Elbow Flexion',
    primary_muscle_group = 'Biceps',
    secondary_muscle_group = 'Forearms'
where name = 'Around the World Bicep Curl';

-- Pull-up variants mislabeled as Horizontal Push / Chest.
update public.exercises
set movement_pattern = 'Vertical Pull',
    primary_muscle_group = 'Back / Lats',
    secondary_muscle_group = 'Biceps'
where name in (
  'Butterfly Chest to Bar Pull Up',
  'Butterfly Pull-Up'
);

-- Shrug mislabeled as Full Body Complex / Quadriceps.
update public.exercises
set movement_pattern = 'Shoulder Isolation',
    primary_muscle_group = 'Back / Lats',
    secondary_muscle_group = null
where name = 'Single Arm Barbell Shrug';
