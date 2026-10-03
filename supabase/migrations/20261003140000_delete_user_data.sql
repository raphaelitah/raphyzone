-- Self-serve account deletion. Almost everything user-owned (profile, plans,
-- sessions, feedback, notifications, entitlements, AI usage…) is removed by
-- ON DELETE CASCADE when the auth user is deleted. What does not cascade is
-- handled here, called by the deleteAccount edge function just before the
-- auth user is removed:
--   * the user's unapproved workouts/exercises (and a workout's blocks, steps
--     and sets, which are keyed by text codes with no foreign keys) are deleted;
--   * workouts/exercises we approved into the shared catalog stay, but lose
--     their author link and name (the Terms licence covers keeping them);
--   * coach links pointing at the user are cleared.
create or replace function public.delete_user_data(p_user uuid)
returns void
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  codes text[];
begin
  select coalesce(array_agg(workout_id) filter (where workout_id is not null), '{}') into codes
  from public.workouts
  where (owner_id = p_user or author_id = p_user) and status is distinct from 'approved';

  delete from public.prescribed_sets where block_exercise_id in (
    select block_exercise_id from public.block_exercises where block_id in (
      select block_id from public.workout_blocks where workout_id = any(codes)));
  delete from public.block_exercises where block_id in (
    select block_id from public.workout_blocks where workout_id = any(codes));
  delete from public.workout_blocks where workout_id = any(codes);

  delete from public.workouts
  where (owner_id = p_user or author_id = p_user) and status is distinct from 'approved';
  update public.workouts
  set owner_id = null, author_id = null, author_name = null
  where owner_id = p_user or author_id = p_user;

  delete from public.exercises
  where author_id = p_user and submission_status is distinct from 'approved';
  update public.exercises
  set author_id = null, author_name = null
  where author_id = p_user;

  update public.athlete_profiles set coach_id = null where coach_id = p_user;
end;
$$;

revoke all on function public.delete_user_data(uuid) from public, anon, authenticated;
grant execute on function public.delete_user_data(uuid) to service_role;
