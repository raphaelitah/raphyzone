import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { callLLM } from '../_shared/llm.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { buildProfileContext, buildWorkoutCatalog, filterCatalogForSelection } from '../_shared/planContext.ts';
import { verifyWorkoutReasons } from '../_shared/verifyWorkoutReasons.ts';

// Ported from base44/functions/swapWorkout — unchanged behavior, Supabase data/LLM layer.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { current_workout_id, day, other_days, focus, slot_type, activity, modality, week_start_date } = body;

    const supabase = getServiceClient();
    const [{ data: profiles }, { data: feedback }, { data: workouts }, { data: weeklyPlans }] = await Promise.all([
      supabase.from('athlete_profiles').select('*').eq('user_id', user.id),
      supabase.from('workout_feedback').select('*').eq('user_id', user.id),
      supabase.from('workouts').select('*').eq('status', 'approved'),
      week_start_date
        ? supabase.from('weekly_plans').select('context_answer, context_notes, setup_equipment').eq('user_id', user.id).eq('week_start_date', week_start_date)
        : Promise.resolve({ data: null as any }),
    ]);
    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404, headers: corsHeaders });

    // Respect this week's saved context/equipment override (set when the plan
    // was generated, e.g. "travelling — bodyweight and running only") so an
    // alternative never suggests something the athlete can't actually do this week.
    const weekPlan = weeklyPlans?.[0];
    const contextAnswer = weekPlan?.context_answer || '';
    const contextNotes = weekPlan?.context_notes || '';
    const setupEquipment: string[] | null = Array.isArray(weekPlan?.setup_equipment) && weekPlan.setup_equipment.length ? weekPlan.setup_equipment : null;
    const effectiveProfile = setupEquipment
      ? { ...profile, equipment_profile: 'custom', available_equipment: setupEquipment, custom_equipment: [] }
      : profile;

    const current = current_workout_id ? (workouts || []).find((w: any) => w.id === current_workout_id) : null;
    const profileContext = buildProfileContext(effectiveProfile, feedback || []);
    const filteredWorkouts = filterCatalogForSelection(workouts || [], effectiveProfile, modality ? [modality] : [], slot_type === 'activity');
    const catalog = buildWorkoutCatalog(filteredWorkouts);

    const dayContext = slot_type === 'activity'
      ? `activity day (${activity || 'activity'}) — the replacement should match this activity's modality (catalog values: "Cyclical / Monostructural" = running/cycling/rowing, "Mixed Conditioning" = metcons/circuits, "Strength / Muscular Endurance" = resistance, "Mobility / Flexibility" = yoga/mobility, "Skill / Power" = powerlifting)`
      : `train day${modality ? ', modality: ' + modality : ''}${focus ? ', focus: ' + focus : ''}`;

    const dayLine = current
      ? `THE WORKOUT TO REPLACE (for ${day || 'this day'}, ${dayContext}): ${current.name}\nExercises: ${current.exercises ? (current.exercises || []).map((e: any) => e.exercise_name).join(', ') : ''}`
      : `THIS DAY IS CURRENTLY EMPTY / REST (for ${day || 'this day'}, ${dayContext}). No workout is assigned yet — suggest one to fill it.`;
    const modalityRule = modality
      ? `- MODALITY MATCHING: the workout MUST match the day's decided modality ("${modality}"). Only suggest workouts whose "modality" field equals this value.`
      : `- MODALITY: no modality is fixed for this day. Choose a modality that complements the other days already assigned and balances the week.`;
    const excludeRule = current
      ? `- EXCLUDE the current workout ("${current.id}") and any workout already assigned to other days.`
      : `- EXCLUDE any workout already assigned to other days.`;

    const prompt = `You are an expert coach. The athlete wants to ${current ? 'replace ONE workout' : 'fill one empty rest day'} in their weekly plan.

${profileContext}
${contextAnswer ? `\nWEEK CONTEXT: ${contextAnswer}${contextNotes ? ' — ' + contextNotes : ''}${setupEquipment ? `\nWEEK EQUIPMENT OVERRIDE (replaces the athlete's normal equipment for THIS WEEK ONLY): ${setupEquipment.join(', ')}` : ''}` : ''}

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

    const res = await callLLM({
      functionName: 'swapWorkout',
      prompt,
      schema: {
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

    const workoutMap = new Map((workouts || []).map((w: any) => [w.id, w]));
    const rawAlternatives = (res.alternatives || [])
      .map((a: any) => {
        const wo: any = workoutMap.get(a.workout_id);
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
        const verified = await verifyWorkoutReasons(
          supabase,
          rawAlternatives.map((a: any) => ({ workout_id: a.workout_id, draft_reason: a.reason }))
        );
        const verifiedMap = new Map(verified.map((v) => [v.workout_id, v.reason]));
        alternatives = rawAlternatives.map((a: any) => ({ ...a, reason: verifiedMap.get(a.workout_id) || a.reason }));
      } catch {
        // fall back to draft reasons
      }
    }

    return Response.json({ alternatives }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
