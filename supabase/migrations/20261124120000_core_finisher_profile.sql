-- Core finisher: an optional, bodyweight abs routine offered after a workout.
--
-- Columns on athlete_profiles (an existing table, so no new grants are needed):
--   core_finisher_enabled    null = the athlete has not reviewed the feature yet
--                            (drives the one-off "new feature" prompt on Home),
--                            true/false = they chose.
--   core_finisher_rounds     number of 40s-on / 20s-off intervals. Multiples of 3
--                            so they split evenly across the 3 exercises of a lap.
--                            A closing 1-minute plank is always added on top.
--   core_finisher_last_picks the exercise ids used in the last two finishers
--                            (newest first), so the next one avoids repeating them.

alter table public.athlete_profiles
  add column if not exists core_finisher_enabled boolean,
  add column if not exists core_finisher_rounds integer not null default 9,
  add column if not exists core_finisher_last_picks jsonb not null default '[]'::jsonb;

alter table public.athlete_profiles
  drop constraint if exists athlete_profiles_core_finisher_rounds_check;
alter table public.athlete_profiles
  add constraint athlete_profiles_core_finisher_rounds_check
  check (core_finisher_rounds in (3, 6, 9, 12));
