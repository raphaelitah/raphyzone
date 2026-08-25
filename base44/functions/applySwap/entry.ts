import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { weekly_plan_id, day, old_workout_id, new_workout_id, reason } = body;
    if (!weekly_plan_id || !day || !old_workout_id || !new_workout_id) {
      return Response.json({ error: 'missing fields' }, { status: 400 });
    }

    const [plan, oldWorkout, newWorkout] = await Promise.all([
      base44.asServiceRole.entities.WeeklyPlan.get(weekly_plan_id),
      base44.asServiceRole.entities.Workout.get(old_workout_id),
      base44.asServiceRole.entities.Workout.get(new_workout_id),
    ]);

    if (!plan || plan.user_id !== user.id) return Response.json({ error: 'Plan not found' }, { status: 404 });

    const updatedWorkouts = (plan.workouts || []).map((w) => {
      if (w.day === day) {
        return {
          ...w,
          workout_id: new_workout_id,
          workout_name: newWorkout?.name || new_workout_id,
          modality: newWorkout?.modality || w.modality,
          reason: reason || w.reason,
          locked: false,
        };
      }
      return w;
    });

    const updated = await base44.asServiceRole.entities.WeeklyPlan.update(weekly_plan_id, { workouts: updatedWorkouts });

    const oldPatterns = (oldWorkout?.exercises || []).map((e) => e.exercise_name).filter(Boolean);
    const newPatterns = (newWorkout?.exercises || []).map((e) => e.exercise_name).filter(Boolean);

    await base44.asServiceRole.entities.WorkoutFeedback.bulkCreate([
      {
        user_id: user.id,
        workout_id: old_workout_id,
        workout_name: oldWorkout?.name || '',
        action: 'rejected',
        replacement_workout_id: new_workout_id,
        day,
        reason: reason || 'swapped by user',
        exercise_patterns: oldPatterns,
      },
      {
        user_id: user.id,
        workout_id: new_workout_id,
        workout_name: newWorkout?.name || '',
        action: 'accepted',
        replacement_workout_id: null,
        day,
        reason: 'chosen as replacement',
        exercise_patterns: newPatterns,
      },
    ]);

    return Response.json({ plan: updated });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}