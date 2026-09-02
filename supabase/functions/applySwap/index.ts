import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';
import { generateWarmup } from '../_shared/warmupGenerator.ts';

// Ported from base44/functions/applySwap. No LLM call — pure data update, so this
// one needs no provider wiring and can be deployed/tested immediately.
Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { weekly_plan_id, day, old_workout_id, new_workout_id, reason } = body;
    if (!weekly_plan_id || !day || !old_workout_id || !new_workout_id) {
      return Response.json({ error: 'missing fields' }, { status: 400, headers: corsHeaders });
    }

    const supabase = getServiceClient();
    const [{ data: plan }, { data: oldWorkout }, { data: newWorkout }, { data: profiles }, { data: exerciseCatalog }] = await Promise.all([
      supabase.from('weekly_plans').select('*').eq('id', weekly_plan_id).maybeSingle(),
      supabase.from('workouts').select('*').eq('id', old_workout_id).maybeSingle(),
      supabase.from('workouts').select('*').eq('id', new_workout_id).maybeSingle(),
      supabase.from('athlete_profiles').select('*').eq('user_id', user.id),
      supabase.from('exercises').select('id, name, movement_category, body_region, movement_pattern, primary_muscle_group, secondary_muscle_group, equipment_tags, modality'),
    ]);

    if (!plan || plan.user_id !== user.id) return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });

    const profile = profiles?.[0];
    let warmup = null;
    if (newWorkout && profile) {
      try {
        warmup = generateWarmup(
          profile,
          [...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])],
          newWorkout,
          exerciseCatalog || []
        );
      } catch {
        warmup = null;
      }
    }

    const updatedWorkouts = (plan.workouts || []).map((w: any) => {
      if (w.day === day && w.workout_id === old_workout_id) {
        return {
          ...w,
          workout_id: new_workout_id,
          workout_name: newWorkout?.name || new_workout_id,
          modality: newWorkout?.modality || w.modality,
          reason: reason || w.reason,
          locked: false,
          warmup,
        };
      }
      return w;
    });

    const { data: updated } = await supabase
      .from('weekly_plans')
      .update({ workouts: updatedWorkouts })
      .eq('id', weekly_plan_id)
      .select()
      .single();

    const oldPatterns = (oldWorkout?.exercises || []).map((e: any) => e.exercise_name).filter(Boolean);
    const newPatterns = (newWorkout?.exercises || []).map((e: any) => e.exercise_name).filter(Boolean);

    await supabase.from('workout_feedback').insert([
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

    return Response.json({ plan: updated }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
