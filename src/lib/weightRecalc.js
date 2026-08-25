import { base44 } from '@/api/base44Client';
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
    const plans = await base44.entities.WeeklyPlan.filter({ user_id: userId, week_start_date: monday });
    const plan = plans.find((p) => p.status === 'approved') || plans[0];
    if (!plan) return;
    await base44.functions.invoke('assignWorkoutWeights', { weekly_plan_id: plan.id });
  } catch { /* silent — background recalc */ }
}