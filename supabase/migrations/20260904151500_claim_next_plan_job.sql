-- Atomically claims the oldest queued plan_generation_jobs row, subject to a
-- pacing guard: if any job started within the last `pacing_seconds`, returns
-- null instead of claiming, so two jobs' token costs never overlap within the
-- same rolling budget window. The actual row claim uses FOR UPDATE SKIP LOCKED
-- so concurrent callers (multiple clients polling at once) can never claim the
-- same job twice — only one racer gets a non-null result.
--
-- security definer + a locked-down search_path: this only ever runs via the
-- service-role client from generateWeeklyPlan/pollPlanJob, never exposed to
-- end users directly, so it deliberately does not filter by requesting user —
-- it claims the globally oldest queued job regardless of who's asking.
create or replace function public.claim_next_plan_job(pacing_seconds integer default 25)
returns public.plan_generation_jobs
language plpgsql
security definer
set search_path = public
as $$
declare
  claimed public.plan_generation_jobs;
  last_start timestamptz;
begin
  select started_at into last_start
  from public.plan_generation_jobs
  where started_at is not null
  order by started_at desc
  limit 1;

  if last_start is not null and now() - last_start < make_interval(secs => pacing_seconds) then
    return null;
  end if;

  update public.plan_generation_jobs
  set status = 'processing', started_at = now()
  where id = (
    select id from public.plan_generation_jobs
    where status = 'queued'
    order by created_at asc
    limit 1
    for update skip locked
  )
  returning * into claimed;

  return claimed;
end;
$$;

grant execute on function public.claim_next_plan_job(integer) to service_role;
