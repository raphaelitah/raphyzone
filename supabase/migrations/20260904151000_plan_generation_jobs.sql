-- Queue for weekly plan generation. Groq's free tier caps tokens/minute, not
-- requests/minute, so concurrent "build my week" clicks are paced through this
-- table instead of racing each other against the same budget and 429ing.
--
-- generateWeeklyPlan still tries to run a job immediately (the common case,
-- when nothing else is mid-generation, behaves exactly like before with no
-- queueing UI). It only falls back to "queued" when another job started too
-- recently to safely fit both within the token budget — see the pacing guard
-- in _shared/planQueue.ts. pollPlanJob is what actually drains the queue: any
-- client polling any job's status will opportunistically claim and run the
-- oldest queued job if the pacing guard allows it, so the queue only advances
-- while someone is actively waiting on a result (a caller waiting on their own
-- job effectively fuels progress for whoever is at the front of the queue).
create table public.plan_generation_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  week_start_date date not null,
  request jsonb not null,
  status text not null default 'queued' check (status in ('queued', 'processing', 'done', 'failed')),
  result jsonb,
  error text,
  notify_email text,
  notified_at timestamptz,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create index plan_generation_jobs_queue_order_idx on public.plan_generation_jobs (created_at) where status = 'queued';
create index plan_generation_jobs_user_idx on public.plan_generation_jobs (user_id, created_at desc);

alter table public.plan_generation_jobs enable row level security;

-- Read-only for owners (or admins) — all writes go through the edge functions
-- (service role), so a client can never fake its own "done" result or claim
-- someone else's queued job.
create policy plan_generation_jobs_owner_select on public.plan_generation_jobs
  for select using (user_id = auth.uid() or is_admin());
