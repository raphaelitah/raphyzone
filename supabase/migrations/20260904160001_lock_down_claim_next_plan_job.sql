-- Postgres grants EXECUTE on new functions to PUBLIC by default, so the
-- original grant in 20260904151500_claim_next_plan_job.sql (grant to
-- service_role only) left anon/authenticated able to call this queue-pacing
-- helper directly via PostgREST RPC, letting any signed-in (or anonymous)
-- caller claim/mutate plan_generation_jobs outside the intended
-- generateWeeklyPlan/pollPlanJob flow. Explicitly revoke from both roles.
revoke execute on function public.claim_next_plan_job(integer) from public;
revoke execute on function public.claim_next_plan_job(integer) from anon;
revoke execute on function public.claim_next_plan_job(integer) from authenticated;
