-- Tracks where the athlete currently is within an in-progress workout
-- (current exercise index, plus which blocks/exercises they've skipped past
-- without a logged set) so leaving and resuming a session lands them back
-- where they left off instead of restarting at exercise 1. Completed
-- exercises are still tracked separately via exercise_sessions; this column
-- only needs to cover the gap skips leave (skipped exercises intentionally
-- aren't persisted to exercise_sessions).
alter table public.workout_sessions
  add column if not exists progress jsonb;
