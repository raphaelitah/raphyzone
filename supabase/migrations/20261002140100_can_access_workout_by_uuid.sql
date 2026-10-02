-- workout_sessions.workout_id holds the workout's uuid (as text), not its
-- workouts.workout_id catalog code — match either so the premium gate on
-- session inserts actually sees the workout being started.
create or replace function public.can_access_workout(p_workout_code text)
returns boolean
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
  select p_workout_code is null
      or public.is_premium(auth.uid())
      or exists (
        select 1 from public.workouts w
        where (w.id::text = p_workout_code or w.workout_id = p_workout_code)
          and (w.is_free or w.owner_id = auth.uid())
      )
      or not exists (
        select 1 from public.workouts w where w.id::text = p_workout_code or w.workout_id = p_workout_code
      );
$$;
