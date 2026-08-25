import { supabase } from '@/lib/supabaseClient';
import { mondayOf, fmtISO } from '@/lib/fitness';

/**
 * Silently recalculates personalized weights for the current week's plan.
 * Fire-and-forget — does not block the UI or surface errors.
 * Called when strength calibration or weight-affecting profile fields change.
 */
export async function recalcPlanWeights(userId) {
  if (!userId) return;
  try {
    const monday = fmtISO(mondayOf(new Date()));
    const { data: plans } = await supabase.from('weekly_plans').select('*').eq('user_id', userId).eq('week_start_date', monday);
    const plan = (plans || []).find((p) => p.status === 'approved') || plans?.[0];
    if (!plan) return;
    await supabase.functions.invoke('assignWorkoutWeights', { body: { weekly_plan_id: plan.id } });
  } catch { /* silent — background recalc */ }
}