-- Lets a user cancel/remove their own not-yet-claimed plan_generation_jobs row.
-- Previously only SELECT was granted (see 20260904151023_plan_generation_jobs.sql),
-- so a stale 'queued' row (e.g. one left behind by an interrupted client) could
-- never be cleared by its owner — and since claim_next_plan_job always claims the
-- globally oldest queued job, a stuck row from one user could keep getting claimed
-- ahead of newer jobs. Scoped to 'queued' only: a job already 'processing'/'done'/
-- 'failed' should stay immutable to the client.
create policy plan_generation_jobs_owner_delete_queued
  on public.plan_generation_jobs
  for delete
  to authenticated
  using (user_id = auth.uid() and status = 'queued');
