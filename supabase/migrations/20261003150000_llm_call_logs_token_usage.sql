-- Token usage per LLM call, so weekly consumption can be measured against the
-- provider limits instead of estimated. Filled from the response's `usage` block
-- by supabase/functions/_shared/llm.ts and by the Instagram writer.
alter table public.llm_call_logs
  add column if not exists prompt_tokens integer,
  add column if not exists completion_tokens integer;
