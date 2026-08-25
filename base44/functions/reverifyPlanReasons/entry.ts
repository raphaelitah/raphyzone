import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// One-off re-verification pass: re-runs the existing verifyWorkoutReasons function
// against every approved WeeklyPlan's assigned slots and persists the corrected
// reason text back onto the plan — WITHOUT regenerating the plan or changing any
// workout assignments, modalities, focuses, or slot structure.
// Admin-only.
export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const plans = await base44.asServiceRole.entities.WeeklyPlan.filter({ status: 'approved' });

    // Collect unique (workout_id -> draft_reason) pairs across all approved plans.
    const draftByWorkout = new Map();
    const planSlots = []; // { planId, day, workout_id, oldReason }
    for (const plan of plans) {
      for (const slot of (plan.workouts || [])) {
        if (slot.workout_id && slot.reason) {
          planSlots.push({ planId: plan.id, day: slot.day, workout_id: slot.workout_id, oldReason: slot.reason });
          if (!draftByWorkout.has(slot.workout_id)) draftByWorkout.set(slot.workout_id, slot.reason);
        }
      }
    }

    if (!draftByWorkout.size) return Response.json({ updated: 0, items: 0, plans: plans.length });

    const items = [...draftByWorkout.entries()].map(([workout_id, draft_reason]) => ({ workout_id, draft_reason }));

    const verifyRes = await base44.asServiceRole.functions.invoke('verifyWorkoutReasons', { items });
    const verified = verifyRes.data?.verified || verifyRes.verified || [];
    // The verifier grounds claims in data but won't reliably upgrade a shorthand equipment
    // token ("rings") to the new exact label ("rings/TRX") when it judges the shorthand
    // accurate. Apply that token normalization ourselves so reasons use the new wording.
    const normalizeLabel = (reason) => {
      if (!reason) return reason;
      return reason.replace(/\brings\b(?!\s*\/\s*TRX)/gi, (m) => `${m}/TRX`);
    };
    const reasonMap = new Map(verified.map((v) => [v.workout_id, normalizeLabel(v.reason)]));

    // Group slot corrections by plan, skipping unchanged reasons to avoid needless writes.
    const byPlan = new Map();
    let changedSlots = 0;
    for (const ps of planSlots) {
      const newReason = reasonMap.get(ps.workout_id);
      if (!newReason || newReason === ps.oldReason) continue;
      if (!byPlan.has(ps.planId)) byPlan.set(ps.planId, []);
      byPlan.get(ps.planId).push({ day: ps.day, workout_id: ps.workout_id, reason: newReason });
      changedSlots++;
    }

    const plansById = new Map(plans.map((p) => [p.id, p]));
    let updatedPlans = 0;
    for (const [planId, corrections] of byPlan) {
      const plan = plansById.get(planId);
      if (!plan) continue;
      const workouts = (plan.workouts || []).map((slot) => {
        const corr = corrections.find((c) => c.day === slot.day && c.workout_id === slot.workout_id);
        return corr ? { ...slot, reason: corr.reason } : slot;
      });
      await base44.asServiceRole.entities.WeeklyPlan.update(planId, { workouts });
      updatedPlans++;
    }

    return Response.json({ updated: updatedPlans, changedSlots, items: items.length, plans: plans.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}