-- Customizable workouts (premium).
--
-- A catalog workout is shared, so it is never edited in place. "Customizing" one
-- (from a plan day, or from "keep these changes" after a workout) clones it into a
-- private personal workout owned by the caller:
--   * ownership_type = 'personal', status = 'private' (new): visible and editable
--     only by its owner, never enters admin review or anyone else's catalog.
--   * source_workout_id = the catalog workout's code, so a plan day can be reset.
-- The existing owner RLS on workouts / workout_blocks / block_exercises /
-- prescribed_sets already lets an owner read and write their own non-approved
-- workouts, so the editor needs no new policies.

alter table public.workouts
  add column if not exists source_workout_id text;

create index if not exists workouts_owner_private_idx
  on public.workouts (owner_id) where status = 'private';

alter table public.workouts drop constraint if exists workouts_status_check;
alter table public.workouts add constraint workouts_status_check
  check (status = any (array['approved'::text, 'pending'::text, 'archived'::text, 'rejected'::text, 'private'::text]));

-- Same guard as before (users can never self-approve), plus: becoming 'private'
-- is a premium feature. Existing private workouts keep working if premium lapses
-- (the status doesn't change), they just can't be created anew.
create or replace function public.guard_workout_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if coalesce(auth.role(), '') not in ('anon', 'authenticated') or public.is_admin() then
    return new;
  end if;
  if tg_op = 'INSERT' then
    if new.status = 'approved' then new.status := 'pending'; end if;
    if new.status = 'private' and not public.is_premium(auth.uid()) then
      raise exception 'premium_required' using errcode = '42501';
    end if;
  elsif new.status is distinct from old.status then
    if new.status = 'approved' then
      new.status := old.status;
    elsif new.status = 'private' and not public.is_premium(auth.uid()) then
      raise exception 'premium_required' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

-- Clones a workout (blocks, exercises, prescribed sets) into a private personal
-- copy for the caller and returns the new workouts row. Idempotent for a workout
-- the caller already owns as a private copy (returns it unchanged).
create or replace function public.customize_workout(p_workout_id uuid)
returns public.workouts
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
declare
  uid uuid := auth.uid();
  src public.workouts;
  dst public.workouts;
  new_code text;
  blk record;
  be record;
  new_block_code text;
  new_be_code text;
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

  new_code := 'WK-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 16);

  insert into public.workouts
  select * from jsonb_populate_record(
    null::public.workouts,
    to_jsonb(src) || jsonb_build_object(
      'id', gen_random_uuid(),
      'workout_id', new_code,
      'name', src.name || ' (custom)',
      'ownership_type', 'personal',
      'status', 'private',
      'owner_id', uid,
      'author_id', uid,
      'is_free', false,
      'rejection_reason', null,
      'similarity_score', null,
      'similarity_note', null,
      'source_workout_id', coalesce(src.source_workout_id, src.workout_id),
      'created_date', now(),
      'updated_date', now()
    )
  )
  returning * into dst;

  for blk in
    select * from public.workout_blocks where workout_id = src.workout_id order by order_index
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

revoke all on function public.customize_workout(uuid) from public, anon;
grant execute on function public.customize_workout(uuid) to authenticated, service_role;
