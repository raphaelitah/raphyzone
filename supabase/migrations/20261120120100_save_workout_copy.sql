-- Save a customized workout under its own name.
--
-- customize_workout (20261119120000) clones a workout for a plan day and returns
-- the existing private copy if you already own it. That is wrong for "I changed
-- this workout, save it as something new": the result must be a NEW workout with
-- a name the athlete chooses, never one that replaces (or shares the name of) the
-- workout it came from.
--
-- This migration:
--   * moves the cloning into an internal helper, _clone_workout(src, uid, name)
--   * gives customize_workout unique auto-names ("X (custom)", "X (custom) 2", ...)
--   * adds save_workout_copy(workout, name): always a new private copy, premium
--     only, with the name checked (not empty, not the original's name, not a
--     catalog workout's name, not another of the caller's workouts).

-- ---------------------------------------------------------------------------
-- Internal: clone a workout's structure under a given name for a given owner.
-- Not callable by clients (revoked below); only the two public functions use it.
-- ---------------------------------------------------------------------------
create or replace function public._clone_workout(p_src public.workouts, p_uid uuid, p_name text)
returns public.workouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  dst public.workouts;
  new_code text;
  blk record;
  be record;
  new_block_code text;
  new_be_code text;
begin
  new_code := 'WK-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

  insert into public.workouts
  select * from jsonb_populate_record(
    null::public.workouts,
    to_jsonb(p_src) || jsonb_build_object(
      'id', gen_random_uuid(),
      'workout_id', new_code,
      'name', p_name,
      'ownership_type', 'personal',
      'status', 'private',
      'owner_id', p_uid,
      'author_id', p_uid,
      'is_free', false,
      'rejection_reason', null,
      'similarity_score', null,
      'similarity_note', null,
      'source_workout_id', coalesce(p_src.source_workout_id, p_src.workout_id),
      'created_date', now(),
      'updated_date', now()
    )
  )
  returning * into dst;

  for blk in
    select * from public.workout_blocks where workout_id = p_src.workout_id order by order_index
  loop
    new_block_code := 'BLK-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
    insert into public.workout_blocks
    select * from jsonb_populate_record(
      null::public.workout_blocks,
      to_jsonb(blk) || jsonb_build_object(
        'id', gen_random_uuid(),
        'block_id', new_block_code,
        'workout_id', new_code,
        'created_date', now(),
        'updated_date', now()
      )
    );

    for be in
      select * from public.block_exercises where block_id = blk.block_id order by order_in_block
    loop
      new_be_code := 'BE-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);
      insert into public.block_exercises
      select * from jsonb_populate_record(
        null::public.block_exercises,
        to_jsonb(be) || jsonb_build_object(
          'id', gen_random_uuid(),
          'block_exercise_id', new_be_code,
          'block_id', new_block_code,
          'created_date', now(),
          'updated_date', now()
        )
      );

      insert into public.prescribed_sets
      select r.*
      from public.prescribed_sets ps,
      lateral jsonb_populate_record(
        null::public.prescribed_sets,
        to_jsonb(ps) || jsonb_build_object(
          'id', gen_random_uuid(),
          'set_id', 'SET-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16),
          'block_exercise_id', new_be_code,
          'created_date', now(),
          'updated_date', now()
        )
      ) r
      where ps.block_exercise_id = be.block_exercise_id;
    end loop;
  end loop;

  return dst;
end;
$$;

revoke all on function public._clone_workout(public.workouts, uuid, text) from public, anon, authenticated;

-- First free "<base>", "<base> 2", "<base> 3", ... among the owner's private workouts.
create or replace function public._unique_custom_name(p_uid uuid, p_base text)
returns text
language plpgsql
stable
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  candidate text := p_base;
  n int := 1;
begin
  while exists (
    select 1 from public.workouts
    where owner_id = p_uid and status = 'private' and lower(name) = lower(candidate)
  ) loop
    n := n + 1;
    candidate := p_base || ' ' || n;
  end loop;
  return candidate;
end;
$$;

revoke all on function public._unique_custom_name(uuid, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- customize_workout: same contract as before, now with a unique default name.
-- ---------------------------------------------------------------------------
create or replace function public.customize_workout(p_workout_id uuid)
returns public.workouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  src public.workouts;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = '42501';
  end if;

  select * into src from public.workouts where id = p_workout_id;
  if not found or not (src.status = 'approved' or src.owner_id = uid) then
    raise exception 'workout_not_found' using errcode = 'P0002';
  end if;

  if src.owner_id = uid and src.status = 'private' then
    return src;
  end if;

  return public._clone_workout(src, uid, public._unique_custom_name(uid, src.name || ' (custom)'));
end;
$$;

revoke all on function public.customize_workout(uuid) from public, anon;
grant execute on function public.customize_workout(uuid) to authenticated, service_role;

-- ---------------------------------------------------------------------------
-- save_workout_copy: always a NEW private copy, under a name the athlete chose.
-- Errors: invalid_name (22023), name_taken (23505), premium_required (42501),
-- workout_not_found (P0002).
-- ---------------------------------------------------------------------------
create or replace function public.save_workout_copy(p_workout_id uuid, p_name text)
returns public.workouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  src public.workouts;
  clean text := btrim(regexp_replace(coalesce(p_name, ''), '\s+', ' ', 'g'));
  root_name text;
begin
  if uid is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  if not public.is_premium(uid) then
    raise exception 'premium_required' using errcode = '42501';
  end if;
  if clean = '' or length(clean) > 80 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select * into src from public.workouts where id = p_workout_id;
  if not found or not (src.status = 'approved' or src.owner_id = uid) then
    raise exception 'workout_not_found' using errcode = 'P0002';
  end if;

  -- The catalog workout this one ultimately came from (if it is itself a copy).
  select name into root_name from public.workouts
    where workout_id = src.source_workout_id and status = 'approved'
    limit 1;

  if lower(clean) = lower(src.name)
     or lower(clean) = lower(coalesce(root_name, ''))
     or exists (select 1 from public.workouts where status = 'approved' and lower(name) = lower(clean))
     or exists (select 1 from public.workouts where owner_id = uid and status = 'private' and lower(name) = lower(clean))
  then
    raise exception 'name_taken' using errcode = '23505';
  end if;

  return public._clone_workout(src, uid, clean);
end;
$$;

revoke all on function public.save_workout_copy(uuid, text) from public, anon;
grant execute on function public.save_workout_copy(uuid, text) to authenticated, service_role;
