-- Kettlebell exercise -> dumbbell counterpart.
--
-- dumbbell_substitutable (20260909200000) covers kettlebell exercises where the
-- bell is just a loaded mass, so the very same exercise works with a dumbbell.
-- It deliberately excludes swing/clean/snatch/high-pull movements. Those have
-- real dumbbell versions in the catalog though ("Russian Dumbbell Swing",
-- "Dumbbell Clean + Press", ...), they just are different exercise rows.
--
-- dumbbell_equivalent_code names that row. For an athlete who owns Dumbbells
-- and no Kettlebell, the plan matcher treats the kettlebell exercise as
-- available and the workout shows / loads the dumbbell exercise in its place.
-- See supabase/functions/_shared/equipmentSubstitution.ts.
--
-- Pairs were reviewed by hand. Left unmapped on purpose:
--  * handle-dependent moves (bottoms-up, horn/halo grip, figure-eight);
--  * Banded Russian Kettlebell Swing - the dumbbell swing has no band;
--  * kettlebell moves with no dumbbell counterpart in the catalog (single-arm
--    swing, high pull, clean from floor, snatch lunge, ...).
alter table public.exercises
  add column if not exists dumbbell_equivalent_code text;

comment on column public.exercises.dumbbell_equivalent_code is
  'exercise_code of the dumbbell exercise that stands in for this kettlebell exercise when the athlete owns Dumbbells but no Kettlebell. NULL when there is no suitable counterpart. Mutually exclusive in practice with dumbbell_substitutable (which means the same exercise works with a dumbbell).';

update public.exercises k
set dumbbell_equivalent_code = m.db_code
from (values
  ('EX00089', 'EX00088'), -- American Kettlebell Swing -> American Dumbbell Swing
  ('EX01919', 'EX01918'), -- Russian Kettlebell Swing -> Russian Dumbbell Swing
  ('EX00716', 'EX01918'), -- Dual Russian Kettlebell Swing -> Russian Dumbbell Swing
  ('EX02199', 'EX02149'), -- Single Arm KB Sumo Deadlift High Pull -> Single Arm DB version
  ('EX01315', 'EX00735'), -- Kettlebell Clean + Press -> Dumbbell Clean + Press
  ('EX01344', 'EX00777'), -- Kettlebell Hang Power Clean -> Dumbbell Hang Power Clean
  ('EX01345', 'EX00778'), -- ... + Push Press
  ('EX01317', 'EX00736'), -- Kettlebell Clean to Goblet Squat -> Dumbbell Clean to Goblet Squat
  ('EX01362', 'EX00828'), -- Kettlebell Squat Clean Thruster -> Dumbbell Squat Clean Thruster
  ('EX00702', 'EX00688'), -- Dual Kettlebell Clean -> Dual Dumbbell Power Clean
  ('EX01314', 'EX02130'), -- Kettlebell Clean + Jerk -> Single Arm Dumbbell Clean and Jerk
  ('EX02400', 'EX02386'), -- Split Stance Kettlebell Snatch -> Split Dumbbell Snatch
  ('EX02197', 'EX02238'), -- Single Arm KB Split Clean -> Single Arm Split Stance DB Power Clean
  -- Dumbbell rows added by 20261109120000_add_single_arm_dumbbell_olympic_exercises.sql
  ('EX02173', 'EX02901'), -- Single Arm KB Clean + Press
  ('EX02092', 'EX02902'), -- Single Arm Alternating KB Clean + Press
  ('EX02259', 'EX02903'), -- Single KB Hang Clean
  ('EX02174', 'EX02904'), -- Single Arm KB Clean and Push Press
  ('EX01316', 'EX02904'), -- KB Clean + Push Press
  ('EX02172', 'EX02905'), -- Single Arm KB Clean + Cossack Squat
  ('EX01346', 'EX02906'), -- KB Hang Power Snatch
  ('EX01360', 'EX02907')  -- KB Snatch
) as m(kb_code, db_code)
where k.exercise_code = m.kb_code
  and k.dumbbell_substitutable = false
  -- Only point at a row that exists, so a missing target can never leave an
  -- exercise mapped to nothing.
  and exists (select 1 from public.exercises d where d.exercise_code = m.db_code);
