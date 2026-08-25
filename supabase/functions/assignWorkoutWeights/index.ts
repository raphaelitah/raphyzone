import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from '../_shared/auth.ts';
import { getServiceClient } from '../_shared/supabaseAdmin.ts';
import { corsHeaders } from '../_shared/cors.ts';

// Ported from base44/functions/assignWorkoutWeights. Assigns personalized target
// weights (kg) to a workout's exercises — or to every workout in a weekly plan —
// based on the athlete's strength calibration, program difficulty, goals,
// equipment maxes, per-exercise overrides, and recent feedback. Decoupled from
// plan generation: it only attaches weights, never changes structure.
//
// Deterministic (no LLM call) — this is a formula over structured inputs, not an
// open-ended reasoning task: baseline (override or pattern calibration) scaled by
// program-difficulty factor, rep-range adjustment, goal adjustment, and recent
// feedback nudge, then clamped to the athlete's equipment max.
//
// Inputs:
//   { weekly_plan_id }  -> process all workout entries, persist exercise_weights, return { plan }
//   { workout_id }      -> process one workout on-demand, return { exercise_weights } (no persist)
const DIFFICULTY_FACTOR: Record<string, number> = {
  recruit: 0.85,
  regular: 0.92,
  challenger: 1.0,
  elite: 1.08,
  beast: 1.15,
};

const GOAL_FACTOR: Record<string, number> = {
  strength: 1.05,
  hypertrophy: 1.0,
  endurance: 0.9,
  general_fitness: 1.0,
};

function avgReps(reps: string | number): number {
  const nums = String(reps).split(/[-–]/).map((s) => parseFloat(s)).filter((x) => !isNaN(x));
  if (!nums.length) return 8;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

function repMultiplier(reps: string | number): number {
  const n = avgReps(reps);
  if (n <= 6) return 1.1;
  if (n <= 9) return 1.0;
  if (n <= 12) return 0.9;
  return 0.8;
}

function feedbackMultiplier(recent: { difficulty?: string }[] | undefined): number {
  if (!recent?.length) return 1.0;
  const sample = recent.slice(0, 4);
  const easy = sample.filter((s) => s.difficulty === 'easy').length;
  const hard = sample.filter((s) => s.difficulty === 'hard' || s.difficulty === 'failed').length;
  if (easy > hard && easy >= Math.ceil(sample.length / 2)) return 1.05;
  if (hard > easy && hard >= Math.ceil(sample.length / 2)) return 0.9;
  return 1.0;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const body = await req.json();
    const { weekly_plan_id, workout_id } = body;
    if (!weekly_plan_id && !workout_id) {
      return Response.json({ error: 'weekly_plan_id or workout_id required' }, { status: 400, headers: corsHeaders });
    }

    const supabase = getServiceClient();

    const { data: profiles } = await supabase.from('athlete_profiles').select('*').eq('user_id', user.id);
    const profile = profiles?.[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404, headers: corsHeaders });

    // Resolve target workouts to process.
    let plan: any = null;
    const targets: { workoutEntityId: string; day: string | null; workout: any }[] = [];
    let workoutCodes: string[] = [];

    if (weekly_plan_id) {
      const { data } = await supabase.from('weekly_plans').select('*').eq('id', weekly_plan_id).maybeSingle();
      plan = data;
      if (!plan || plan.user_id !== user.id) return Response.json({ error: 'Plan not found' }, { status: 404, headers: corsHeaders });
      const ids = (plan.workouts || []).map((w: any) => w.workout_id).filter(Boolean);
      const { data: workouts } = ids.length ? await supabase.from('workouts').select('*').in('id', ids) : { data: [] };
      const wMap = new Map((workouts || []).map((w: any) => [w.id, w]));
      (plan.workouts || []).forEach((w: any) => {
        if (w.workout_id && wMap.has(w.workout_id)) {
          targets.push({ workoutEntityId: w.workout_id, day: w.day, workout: wMap.get(w.workout_id) });
        }
      });
      workoutCodes = [...new Set((workouts || []).map((w: any) => w.workout_id).filter(Boolean))];
    } else {
      const { data: wo } = await supabase.from('workouts').select('*').eq('id', workout_id).maybeSingle();
      if (!wo) return Response.json({ error: 'Workout not found' }, { status: 404, headers: corsHeaders });
      targets.push({ workoutEntityId: workout_id, day: null, workout: wo });
      workoutCodes = wo.workout_id ? [wo.workout_id] : [];
    }

    // Scoped fetches: only blocks for these workouts, then block exercises for those blocks, then sets + exercises
    const { data: allBlocksData } = workoutCodes.length
      ? await supabase.from('workout_blocks').select('*').in('workout_id', workoutCodes)
      : { data: [] };
    const allBlocks = allBlocksData || [];
    const blockIds = allBlocks.map((b: any) => b.block_id);
    const { data: allBlockExsData } = blockIds.length
      ? await supabase.from('block_exercises').select('*').in('block_id', blockIds)
      : { data: [] };
    const allBlockExs = allBlockExsData || [];
    const exerciseBlockExs = allBlockExs.filter((be: any) => be.step_type === 'exercise');
    const beIds = exerciseBlockExs.map((be: any) => be.block_exercise_id);
    const exerciseCodes = [...new Set(exerciseBlockExs.map((be: any) => be.exercise_id).filter(Boolean))];
    const [{ data: allSetsData }, { data: allExsData }] = await Promise.all([
      beIds.length ? supabase.from('prescribed_sets').select('*').in('block_exercise_id', beIds) : Promise.resolve({ data: [] }),
      exerciseCodes.length ? supabase.from('exercises').select('*').in('exercise_code', exerciseCodes) : Promise.resolve({ data: [] }),
    ]);
    const allSets = allSetsData || [];
    const allExs = allExsData || [];

    const exerciseMapByCode: Record<string, any> = {};
    allExs.forEach((e: any) => { if (e.exercise_code) exerciseMapByCode[e.exercise_code] = e; });
    const blocksByWorkoutCode: Record<string, any[]> = {};
    allBlocks.forEach((b: any) => { (blocksByWorkoutCode[b.workout_id] = blocksByWorkoutCode[b.workout_id] || []).push(b); });
    const blockExsByBlock: Record<string, any[]> = {};
    allBlockExs.forEach((be: any) => { (blockExsByBlock[be.block_id] = blockExsByBlock[be.block_id] || []).push(be); });
    const setsByBE: Record<string, any[]> = {};
    allSets.forEach((s: any) => { (setsByBE[s.block_exercise_id] = setsByBE[s.block_exercise_id] || []).push(s); });

    // Build a flat list of exercise rows across all targets.
    const rows: any[] = [];
    targets.forEach((t) => {
      const blocks = (blocksByWorkoutCode[t.workout.workout_id] || [])
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      blocks.forEach((block: any) => {
        const blockExs = (blockExsByBlock[block.block_id] || [])
          .filter((be: any) => be.step_type === 'exercise')
          .sort((a: any, b: any) => (a.order_in_block || 0) - (b.order_in_block || 0));
        blockExs.forEach((be: any) => {
          if (!be.exercise_id) return;
          const sets = setsByBE[be.block_exercise_id] || [];
          const setCount = sets.length || 1;
          const reps = sets[0]?.target_reps?.toString() || be.prescription_value || '';
          const details = exerciseMapByCode[be.exercise_id] || null;
          rows.push({
            index: rows.length,
            workoutEntityId: t.workoutEntityId,
            exercise_id: be.exercise_id,
            exercise_name: details?.name || be.exercise_title_raw || 'Exercise',
            movement_pattern: details?.movement_pattern || null,
            equipment: details?.equipment || null,
            requires_load: details?.requires_load !== false,
            sets: setCount,
            reps,
            current_load: be.load_value ? parseFloat(be.load_value) : null,
          });
        });
      });
    });

    // Include extra exercises (e.g., swapped-in exercises not in the original blocks)
    const extra_exercise_codes = (body.extra_exercise_codes || []).filter((c: string) => c && !exerciseCodes.includes(c));
    if (extra_exercise_codes.length) {
      const { data: extraExs } = await supabase.from('exercises').select('*').in('exercise_code', extra_exercise_codes);
      const extraMap: Record<string, any> = {};
      (extraExs || []).forEach((e: any) => { extraMap[e.exercise_code] = e; });
      const refRow = rows[0];
      extra_exercise_codes.forEach((code: string) => {
        const details = extraMap[code];
        if (!details) return;
        rows.push({
          index: rows.length,
          workoutEntityId: targets[0]?.workoutEntityId,
          exercise_id: code,
          exercise_name: details.name,
          movement_pattern: details.movement_pattern || null,
          equipment: details.equipment || null,
          requires_load: details.requires_load !== false,
          sets: refRow?.sets || 3,
          reps: refRow?.reps || '8-12',
          current_load: null,
        });
      });
    }

    const loadedExerciseIds = new Set(rows.filter((r) => r.requires_load).map((r) => r.exercise_id));

    // Nothing to assign.
    if (!rows.length) {
      if (weekly_plan_id) return Response.json({ plan }, { headers: corsHeaders });
      return Response.json({ exercise_weights: {} }, { headers: corsHeaders });
    }
    if (!loadedExerciseIds.size) {
      if (weekly_plan_id) {
        const updatedWorkouts = (plan.workouts || []).map((w: any) => ({ ...w, exercise_weights: {} }));
        const { data: updated } = await supabase.from('weekly_plans').update({ workouts: updatedWorkouts }).eq('id', weekly_plan_id).select().single();
        return Response.json({ plan: updated }, { headers: corsHeaders });
      }
      return Response.json({ exercise_weights: {} }, { headers: corsHeaders });
    }

    // Recent feedback for these exercises.
    const recentByExercise: Record<string, any[]> = {};
    const { data: sessions } = await supabase
      .from('exercise_sessions')
      .select('*')
      .eq('user_id', user.id)
      .order('created_date', { ascending: false })
      .limit(100);
    (sessions || []).forEach((s: any) => {
      if (loadedExerciseIds.has(s.exercise_id)) {
        (recentByExercise[s.exercise_id] = recentByExercise[s.exercise_id] || []).push({
          max_weight: s.max_weight,
          difficulty: s.difficulty,
        });
      }
    });

    const calibration = (profile.strength_calibration || []).filter((c: any) => c.weight_kg);
    const overrideMap: Record<string, number> = {};
    (profile.exercise_weight_overrides || []).forEach((o: any) => { overrideMap[o.exercise_id] = o.weight_kg; });

    const factor = DIFFICULTY_FACTOR[profile.program_difficulty] ?? 1.0;
    const ws = profile.weight_setup || {};
    const goalFactor = GOAL_FACTOR[profile.goal] ?? 1.0;

    const calibrationByPattern: Record<string, { weight_kg: number; reps: number }> = {};
    calibration.forEach((c: any) => {
      if (c.pattern) calibrationByPattern[c.pattern] = { weight_kg: c.weight_kg, reps: c.reps || 8 };
    });

    const weights = rows
      .filter((r) => r.requires_load)
      .map((r) => {
        const baseline = overrideMap[r.exercise_id] ?? calibrationByPattern[r.movement_pattern || '']?.weight_kg ?? null;
        if (baseline == null) return { index: r.index, exercise_id: r.exercise_id, target_weight_kg: null };
        const target = baseline * factor * repMultiplier(r.reps) * goalFactor * feedbackMultiplier(recentByExercise[r.exercise_id]);
        return { index: r.index, exercise_id: r.exercise_id, target_weight_kg: target };
      });

    const res = { weights };

    const clamp = (kg: number | null, equipment: string | null) => {
      if (kg == null || isNaN(kg)) return null;
      const eq = (equipment || '').toLowerCase();
      const maxFor = (cat: string) => {
        const m = ws[cat]?.max_kg;
        return typeof m === 'number' && m > 0 ? m : null;
      };
      let max: number | null = null;
      if (eq.includes('dumbbell')) max = maxFor('dumbbells');
      else if (eq.includes('barbell') || eq.includes('ez bar') || eq.includes('plate')) max = maxFor('barbell');
      else if (eq.includes('kettlebell')) max = maxFor('kettlebells');
      if (max != null && kg > max) return max;
      return Math.round(kg * 10) / 10;
    };

    // weights keyed by workoutEntityId -> exercise_id -> kg
    const weightsByWorkout: Record<string, Record<string, number | null>> = {};
    (res.weights || []).forEach((w: any) => {
      const row = rows[w.index] || rows.find((r) => r.exercise_id === w.exercise_id);
      if (!row) return;
      if (!row.requires_load) {
        (weightsByWorkout[row.workoutEntityId] = weightsByWorkout[row.workoutEntityId] || {})[row.exercise_id] = null;
        return;
      }
      const clamped = clamp(w.target_weight_kg, row.equipment);
      (weightsByWorkout[row.workoutEntityId] = weightsByWorkout[row.workoutEntityId] || {})[row.exercise_id] = clamped;
    });

    if (weekly_plan_id && plan) {
      const updatedWorkouts = (plan.workouts || []).map((w: any) => ({
        ...w,
        exercise_weights: weightsByWorkout[w.workout_id] || {},
      }));
      const { data: updated } = await supabase.from('weekly_plans').update({ workouts: updatedWorkouts }).eq('id', weekly_plan_id).select().single();
      return Response.json({ plan: updated }, { headers: corsHeaders });
    }

    const singleId = targets[0]?.workoutEntityId;
    return Response.json({ exercise_weights: weightsByWorkout[singleId!] || {} }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});
