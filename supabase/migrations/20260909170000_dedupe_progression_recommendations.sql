-- learnFromSessionFeedback reads existing pending recs, decides what's missing, then
-- inserts. Two concurrent invocations (e.g. React effect firing twice) can both pass
-- that read before either writes, producing duplicate pending recs for the same
-- exercise/pattern. Partial unique indexes make the DB the arbiter, and the RPC below
-- inserts via ON CONFLICT DO NOTHING against them so the race can't produce duplicates.
create unique index if not exists progression_recommendations_pending_exercise_uidx
  on progression_recommendations (user_id, exercise_id)
  where status = 'pending' and adjustment_type <> 'pattern_baseline';

create unique index if not exists progression_recommendations_pending_pattern_uidx
  on progression_recommendations (user_id, pattern)
  where status = 'pending' and adjustment_type = 'pattern_baseline';

create or replace function create_progression_recommendation(
  p_user_id uuid,
  p_exercise_id text,
  p_exercise_name text,
  p_current_weight numeric,
  p_suggested_weight numeric,
  p_reason text,
  p_evidence text,
  p_confidence numeric,
  p_adjustment_type text,
  p_pattern text,
  p_new_weight_kg numeric,
  p_reps numeric
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_rows int;
begin
  if p_adjustment_type = 'pattern_baseline' then
    insert into progression_recommendations
      (user_id, exercise_id, exercise_name, current_weight, suggested_weight, reason, evidence, confidence, status, adjustment_type, pattern, new_weight_kg, reps)
    values
      (p_user_id, p_exercise_id, p_exercise_name, p_current_weight, p_suggested_weight, p_reason, p_evidence, p_confidence, 'pending', p_adjustment_type, p_pattern, p_new_weight_kg, p_reps)
    on conflict (user_id, pattern) where status = 'pending' and adjustment_type = 'pattern_baseline'
    do nothing;
  else
    insert into progression_recommendations
      (user_id, exercise_id, exercise_name, current_weight, suggested_weight, reason, evidence, confidence, status, adjustment_type, pattern, new_weight_kg, reps)
    values
      (p_user_id, p_exercise_id, p_exercise_name, p_current_weight, p_suggested_weight, p_reason, p_evidence, p_confidence, 'pending', p_adjustment_type, p_pattern, p_new_weight_kg, p_reps)
    on conflict (user_id, exercise_id) where status = 'pending' and adjustment_type <> 'pattern_baseline'
    do nothing;
  end if;

  get diagnostics v_rows = row_count;
  return v_rows > 0;
end;
$$;

grant execute on function create_progression_recommendation(uuid, text, text, numeric, numeric, text, text, numeric, text, text, numeric, numeric) to authenticated, service_role;
