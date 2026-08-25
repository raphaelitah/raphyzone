import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

// Assigns personalized target weights (kg) to a workout's exercises — or to every
// workout in a weekly plan — based on the athlete's strength calibration, program
// difficulty, goals, equipment maxes, per-exercise overrides, and recent feedback.
// Decoupled from plan generation: it only attaches weights, never changes structure.
//
// Inputs:
//   { weekly_plan_id }  -> process all workout entries, persist exercise_weights, return { plan }
//   { workout_id }      -> process one workout on-demand, return { exercise_weights } (no persist)
export default async function (req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { weekly_plan_id, workout_id } = body;
    if (!weekly_plan_id && !workout_id) {
      return Response.json({ error: 'weekly_plan_id or workout_id required' }, { status: 400 });
    }

    const profiles = await base44.asServiceRole.entities.AthleteProfile.filter({ user_id: user.id });
    const profile = profiles[0];
    if (!profile) return Response.json({ error: 'Profile not found' }, { status: 404 });

    // Resolve target workouts to process.
    let plan = null;
    const targets = []; // { workoutEntityId, day, workout }
    let workoutCodes = [];

    if (weekly_plan_id) {
      plan = await base44.asServiceRole.entities.WeeklyPlan.get(weekly_plan_id);
      if (!plan || plan.user_id !== user.id) return Response.json({ error: 'Plan not found' }, { status: 404 });
      const ids = (plan.workouts || []).map((w) => w.workout_id).filter(Boolean);
      const workouts = ids.length ? await base44.asServiceRole.entities.Workout.filter({ id: { $in: ids } }) : [];
      const wMap = new Map(workouts.map((w) => [w.id, w]));
      (plan.workouts || []).forEach((w) => {
        if (w.workout_id && wMap.has(w.workout_id)) {
          targets.push({ workoutEntityId: w.workout_id, day: w.day, workout: wMap.get(w.workout_id) });
        }
      });
      workoutCodes = [...new Set(workouts.map((w) => w.workout_id).filter(Boolean))];
    } else {
      const wo = await base44.asServiceRole.entities.Workout.get(workout_id);
      if (!wo) return Response.json({ error: 'Workout not found' }, { status: 404 });
      targets.push({ workoutEntityId: workout_id, day: null, workout: wo });
      workoutCodes = wo.workout_id ? [wo.workout_id] : [];
    }

    // Scoped fetches: only blocks for these workouts, then block exercises for those blocks, then sets + exercises
    const allBlocks = workoutCodes.length
      ? await base44.asServiceRole.entities.WorkoutBlock.filter({ workout_id: { $in: workoutCodes } })
      : [];
    const blockIds = allBlocks.map((b) => b.block_id);
    const allBlockExs = blockIds.length
      ? await base44.asServiceRole.entities.BlockExercise.filter({ block_id: { $in: blockIds } })
      : [];
    const exerciseBlockExs = allBlockExs.filter((be) => be.step_type === 'exercise');
    const beIds = exerciseBlockExs.map((be) => be.block_exercise_id);
    const exerciseCodes = [...new Set(exerciseBlockExs.map((be) => be.exercise_id).filter(Boolean))];
    const [allSets, allExs] = await Promise.all([
      beIds.length ? base44.asServiceRole.entities.PrescribedSet.filter({ block_exercise_id: { $in: beIds } }) : Promise.resolve([]),
      exerciseCodes.length ? base44.asServiceRole.entities.Exercise.filter({ exercise_code: { $in: exerciseCodes } }) : Promise.resolve([]),
    ]);

    const exerciseMapByCode = {};
    allExs.forEach((e) => { if (e.exercise_code) exerciseMapByCode[e.exercise_code] = e; });
    const blocksByWorkoutCode = {};
    allBlocks.forEach((b) => { (blocksByWorkoutCode[b.workout_id] = blocksByWorkoutCode[b.workout_id] || []).push(b); });
    const blockExsByBlock = {};
    allBlockExs.forEach((be) => { (blockExsByBlock[be.block_id] = blockExsByBlock[be.block_id] || []).push(be); });
    const setsByBE = {};
    allSets.forEach((s) => { (setsByBE[s.block_exercise_id] = setsByBE[s.block_exercise_id] || []).push(s); });

    // Build a flat list of exercise rows across all targets.
    const rows = [];
    targets.forEach((t) => {
      const blocks = (blocksByWorkoutCode[t.workout.workout_id] || [])
        .sort((a, b) => (a.order_index || 0) - (b.order_index || 0));
      blocks.forEach((block) => {
        const blockExs = (blockExsByBlock[block.block_id] || [])
          .filter((be) => be.step_type === 'exercise')
          .sort((a, b) => (a.order_in_block || 0) - (b.order_in_block || 0));
        blockExs.forEach((be) => {
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
    const extra_exercise_codes = (body.extra_exercise_codes || []).filter((c) => c && !exerciseCodes.includes(c));
    if (extra_exercise_codes.length) {
      const extraExs = await base44.asServiceRole.entities.Exercise.filter({ exercise_code: { $in: extra_exercise_codes } });
      const extraMap = {};
      extraExs.forEach((e) => { extraMap[e.exercise_code] = e; });
      const refRow = rows[0];
      extra_exercise_codes.forEach((code) => {
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
      if (weekly_plan_id) return Response.json({ plan });
      return Response.json({ exercise_weights: {} });
    }
    if (!loadedExerciseIds.size) {
      const empty = {};
      if (weekly_plan_id) {
        const updatedWorkouts = (plan.workouts || []).map((w) => ({ ...w, exercise_weights: {} }));
        const updated = await base44.asServiceRole.entities.WeeklyPlan.update(weekly_plan_id, { workouts: updatedWorkouts });
        return Response.json({ plan: updated });
      }
      return Response.json({ exercise_weights: empty });
    }

    // Recent feedback for these exercises.
    const recentByExercise = {};
    const sessions = await base44.asServiceRole.entities.ExerciseSession.filter({ user_id: user.id }, '-created_date', 100);
    sessions.forEach((s) => {
      if (loadedExerciseIds.has(s.exercise_id)) {
        (recentByExercise[s.exercise_id] = recentByExercise[s.exercise_id] || []).push({
          max_weight: s.max_weight,
          difficulty: s.difficulty,
        });
      }
    });

    const calibration = (profile.strength_calibration || []).filter((c) => c.weight_kg);
    const overrideMap = {};
    (profile.exercise_weight_overrides || []).forEach((o) => { overrideMap[o.exercise_id] = o.weight_kg; });

    const factor = DIFFICULTY_FACTOR[profile.program_difficulty] ?? 1.0;
    const ws = profile.weight_setup || {};

    const prompt = `You are an expert strength coach assigning working weights to exercises for an athlete. All weights are in kg.

ATHLETE PROFILE:
- Goal: ${profile.goal}${profile.secondary_goal && profile.secondary_goal !== 'none' ? ' (secondary: ' + profile.secondary_goal + ')' : ''}
- Experience: ${profile.experience_level}
- Program difficulty: ${profile.program_difficulty} (load intensity factor ${factor} — scale baseline loads by this)
- Weight setup maxes (kg): dumbbells ${ws.dumbbells?.max_kg ?? 'n/a'}, barbell ${ws.barbell?.max_kg ?? 'n/a'}, kettlebells ${ws.kettlebells?.max_kg ?? 'n/a'}

STRENGTH CALIBRATION (baseline ~8-rep working weights by movement pattern, kg):
${calibration.map((c) => `- ${c.pattern}: ${c.exercise} @ ${c.weight_kg}kg for ~${c.reps || 8} reps`).join('\n') || '- none'}

PER-EXERCISE OVERRIDES (use these as the baseline when the exercise_id matches, kg):
${Object.entries(overrideMap).map(([id, w]) => `- ${id}: ${w}kg`).join('\n') || '- none'}

RECENT FEEDBACK PER EXERCISE (last weights used + difficulty):
${Object.entries(recentByExercise).map(([id, list]) => `- ${id}: ${list.slice(0, 4).map((s) => `${s.max_weight ?? '?'}kg/${s.difficulty}`).join(', ')}`).join('\n') || '- none'}

EXERCISES TO ASSIGN (give a target_weight_kg for each requires_load=true; null for bodyweight):
${rows.map((r) => `${r.index}: id=${r.exercise_id} | ${r.exercise_name} | pattern=${r.movement_pattern || 'n/a'} | equipment=${r.equipment || 'bodyweight'} | requires_load=${r.requires_load} | sets=${r.sets} reps=${r.reps} | current_load=${r.current_load ?? 'none'}`).join('\n')}

RULES:
- For each requires_load exercise, pick target_weight_kg. Use the matching pattern calibration as the baseline, scaled by the load intensity factor, adjusted for reps (higher reps → lower % of baseline) and goal (strength → heavier; hypertrophy → moderate).
- If a per-exercise override exists for that exercise_id, use it as the baseline instead of the pattern.
- Use recent feedback: "easy" → nudge up; "hard"/"failed" → nudge down.
- NEVER exceed the weight setup max for the exercise's equipment (dumbbells→dumbbells max, barbell/EZ bar/plates→barbell max, kettlebell→kettlebells max). If no max is set for that category, do not clamp.
- Bodyweight / requires_load=false → target_weight_kg = null.
- Round to a practical increment (0.5kg small, 1.25kg barbell, 2.5kg large).
- Return one entry per row by index.

Return JSON { "weights": [{ "index": number, "exercise_id": string, "target_weight_kg": number|null }] }.`;

    const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: 'object',
        properties: {
          weights: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                index: { type: 'number' },
                exercise_id: { type: 'string' },
                target_weight_kg: { type: 'number' },
              },
              required: ['exercise_id', 'target_weight_kg'],
            },
          },
        },
        required: ['weights'],
      },
    });

    const clamp = (kg, equipment) => {
      if (kg == null || isNaN(kg)) return null;
      const eq = (equipment || '').toLowerCase();
      const maxFor = (cat) => {
        const m = ws[cat]?.max_kg;
        return typeof m === 'number' && m > 0 ? m : null;
      };
      let max = null;
      if (eq.includes('dumbbell')) max = maxFor('dumbbells');
      else if (eq.includes('barbell') || eq.includes('ez bar') || eq.includes('plate')) max = maxFor('barbell');
      else if (eq.includes('kettlebell')) max = maxFor('kettlebells');
      if (max != null && kg > max) return max;
      return Math.round(kg * 10) / 10;
    };

    // weights keyed by workoutEntityId -> exercise_id -> kg
    const weightsByWorkout = {};
    (res.weights || []).forEach((w) => {
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
      const updatedWorkouts = (plan.workouts || []).map((w) => ({
        ...w,
        exercise_weights: weightsByWorkout[w.workout_id] || {},
      }));
      const updated = await base44.asServiceRole.entities.WeeklyPlan.update(weekly_plan_id, { workouts: updatedWorkouts });
      return Response.json({ plan: updated });
    }

    const singleId = targets[0]?.workoutEntityId;
    return Response.json({ exercise_weights: weightsByWorkout[singleId] || {} });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

const DIFFICULTY_FACTOR = {
  recruit: 0.85,
  regular: 0.92,
  challenger: 1.0,
  elite: 1.08,
  beast: 1.15,
};