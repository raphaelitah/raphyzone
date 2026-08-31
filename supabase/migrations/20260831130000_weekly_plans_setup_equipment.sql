-- Structured (non-free-text) equipment override for a week's "different setup"
-- context (e.g. travelling, less equipment). When set, this array of equipment
-- names replaces the athlete's normal available/custom equipment for that
-- week's plan generation, regeneration, and "find an alternative" swaps.
alter table public.weekly_plans add column if not exists setup_equipment jsonb;
