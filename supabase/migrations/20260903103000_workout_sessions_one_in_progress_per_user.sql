-- Guarantees at most one in-progress workout session per user at the database
-- level. The app already checks-then-inserts to avoid this, but that check is
-- not atomic (e.g. two tabs starting a workout at once can both pass it), so
-- this unique partial index is the real guard; WorkoutExecution.jsx handles
-- the resulting unique-violation (23505) by adopting or surfacing the winner.
create unique index if not exists workout_sessions_one_in_progress_per_user
  on public.workout_sessions (user_id)
  where status = 'in_progress';
