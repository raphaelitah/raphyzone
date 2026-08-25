import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';
import { buildProfileContext, buildWorkoutCatalog } from '../../shared/planContext.ts';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { current_workout_id, day, other_days, focus, slot_type, activity, modality } = body;
    const [profiles, feedback, workouts] = await Promise.all([
      base44.asServiceRole.entities.AthleteProfile.filter({ user_id: user.id }),
      base44.asServiceRole.entities.WorkoutFeedback.filter({ user_id: user.id }),
      base44.asServiceRole.entities.Workout.filter({ status: 'approved' }),
    ]);
    const profile = profiles[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    const current = current_workout_id ? workouts.find((w) => w.id === current_workout_id) : null;
    const profileContext = buildProfileContext(profile, feedback);
    const catalog = buildWorkoutCatalog(workouts);

    const dayContext = slot_type === 'activity'
      ? `activity day (${activity || 'activity'}) — the replacement should match this activity's modality (catalog values: "Cyclical / Monostructural" = running/cycling/rowing, "Mixed Conditioning" = metcons/circuits, "Strength / Muscular Endurance" = resistance, "Mobility / Flexibility" = yoga/mobility, "Skill / Power" = powerlifting)`
      : `train day${modality ? ', modality: ' + modality : ''}${focus ? ', focus: ' + focus : ''}`;

    const dayLine = current
      ? `THE WORKOUT TO REPLACE (for ${day || 'this day'}, ${dayContext}): ${current.name}\nExercises: ${current.exercises ? (current.exercises || []).map((e) => e.exercise_name).join(', ') : ''}`
      : `THIS DAY IS CURRENTLY EMPTY / REST (for ${day || 'this day'}, ${dayContext}). No workout is assigned yet — suggest one to fill it.`;
    const modalityRule = modality
      ? `- MODALITY MATCHING: the workout MUST match the day's decided modality ("${modality}"). Only suggest workouts whose "modality" field equals this value.`
      : `- MODALITY: no modality is fixed for this day. Choose a modality that complements the other days already assigned and balances the week.`;
    const excludeRule = current
      ? `- EXCLUDE the current workout ("${current.id}") and any workout already assigned to other days.`
      : `- EXCLUDE any workout already assigned to other days.`;

    const prompt = `You are an expert coach. The athlete wants to ${current ? 'replace ONE workout' : 'fill one empty rest day'} in their weekly plan.

${profileContext}

${dayLine}

OTHER DAYS ALREADY ASSIGNED (do not duplicate these workouts): ${other_days || 'none'}

WORKOUT CATALOG (choose from this list by id; each workout has a "modality" field):
${catalog}

RULES:
- Suggest 2 to 3 DIFFERENT workouts from the catalog that fit this day's slot and context.
${modalityRule}
${excludeRule}
- EXCLUDE any workout whose exercises intersect the athlete's dislikes or frequently-rejected patterns.
- Match the day's desired duration, focus/activity, and the athlete's goal as closely as possible.
- EQUIPMENT MATCHING IS MANDATORY: Only suggest a workout if ALL its required equipment is in the athlete's "Available equipment" list. If the equipment profile is CUSTOM, the athlete does NOT have a full gym — never suggest a workout requiring equipment they don't have.
- Rank by best fit.

Return JSON with an "alternatives" array of { workout_id, reason }.`;

    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          alternatives: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                workout_id: { type: 'string' },
                reason: { type: 'string' },
              },
              required: ['workout_id', 'reason'],
            },
          },
        },
        required: ['alternatives'],
      },
    });

    const workoutMap = new Map(workouts.map((w) => [w.id, w]));
    const rawAlternatives = (res.alternatives || [])
      .map((a) => {
        const wo = workoutMap.get(a.workout_id);
        if (!wo) return null;
        return {
          workout_id: wo.id,
          workout_name: wo.name,
          format_label: wo.format_label || wo.workout_format || '',
          est_duration_min: wo.est_duration_min || wo.duration_minutes || null,
          reason: a.reason,
        };
      })
      .filter(Boolean)
      .slice(0, 3);

    // Verify each alternative's draft reason against its actual workout data.
    let alternatives = rawAlternatives;
    if (rawAlternatives.length) {
      try {
        const verifyRes = await base44.asServiceRole.functions.invoke('verifyWorkoutReasons', {
          items: rawAlternatives.map((a) => ({ workout_id: a.workout_id, draft_reason: a.reason })),
        });
        const verifiedMap = new Map((verifyRes.data?.verified || []).map((v) => [v.workout_id, v.reason]));
        alternatives = rawAlternatives.map((a) => ({ ...a, reason: verifiedMap.get(a.workout_id) || a.reason }));
      } catch {
        // fall back to draft reasons
      }
    }

    return Response.json({ alternatives });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}