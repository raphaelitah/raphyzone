import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

const BATCH_SIZE = 10;

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Admin only' }, { status: 403 });

    const [workouts, blocks, blockExs, exercises, modalityTerms] = await Promise.all([
      base44.asServiceRole.entities.Workout.filter({ status: 'approved' }),
      base44.asServiceRole.entities.WorkoutBlock.list('-created_date', 1000),
      base44.asServiceRole.entities.BlockExercise.list('-created_date', 2000),
      base44.asServiceRole.entities.Exercise.list('-created_date', 2000),
      base44.asServiceRole.entities.TaxonomyTerm.filter({ dimension: 'modality' }),
    ]);

    const modalityValues = (modalityTerms || []).map((t) => t.value).filter(Boolean);
    if (!modalityValues.length) modalityValues.push('strength', 'conditioning', 'running', 'mixed', 'yoga', 'mobility');

    // Build lookup maps
    const exerciseByCode = new Map(exercises.map((e) => [e.exercise_code, e]));
    const blockExsByBlock = new Map();
    for (const be of blockExs) {
      if (!blockExsByBlock.has(be.block_id)) blockExsByBlock.set(be.block_id, []);
      blockExsByBlock.get(be.block_id).push(be);
    }
    const blocksByWorkoutCode = new Map();
    for (const b of blocks) {
      if (!blocksByWorkoutCode.has(b.workout_id)) blocksByWorkoutCode.set(b.workout_id, []);
      blocksByWorkoutCode.get(b.workout_id).push(b);
    }

    // Assemble exercise data per workout
    const workoutData = workouts.map((w) => {
      const isRunning = /^run\b/i.test((w.name || '').trim());
      const wBlocks = blocksByWorkoutCode.get(w.workout_id) || [];
      const blockIds = wBlocks.map((b) => b.block_id);
      const beList = blockIds.flatMap((bid) => blockExsByBlock.get(bid) || []);
      const exMeta = beList
        .filter((be) => be.step_type === 'exercise' && be.exercise_id)
        .map((be) => exerciseByCode.get(be.exercise_id))
        .filter(Boolean);
      const equipmentUnion = [...new Set(exMeta.map((e) => e.equipment).filter(Boolean))]
        .filter((e) => e && e !== 'bodyweight' && e !== 'none');

      const exSummary = beList
        .filter((be) => be.step_type === 'exercise')
        .map((be) => {
          const meta = exerciseByCode.get(be.exercise_id);
          return {
            name: be.exercise_title_raw || meta?.name || be.exercise_id,
            reps: be.prescription_value || '?',
            equipment: meta?.equipment || 'bodyweight',
            body_region: meta?.body_region || '?',
            movement_pattern: meta?.movement_pattern || '?',
          };
        });

      return {
        id: w.id,
        name: w.name,
        workout_id: w.workout_id,
        workout_format: w.workout_format,
        format_label: w.format_label,
        workout_category: w.workout_category,
        difficulty: w.difficulty,
        oldModality: w.modality,
        oldGoal: w.goal,
        oldSplit: w.split,
        oldEquipment: w.equipment || [],
        isRunning,
        exercises: exSummary,
        equipmentUnion,
      };
    });

    const toClassify = workoutData.filter((w) => !w.isRunning);
    const runningCount = workoutData.length - toClassify.length;

    // Batch
    const batches = [];
    for (let i = 0; i < toClassify.length; i += BATCH_SIZE) {
      batches.push(toClassify.slice(i, i + BATCH_SIZE));
    }

    const allResults = [];
    for (const batch of batches) {
      const prompt = buildBatchPrompt(batch, modalityValues);
      const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            results: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  modality: { type: 'string' },
                  goal: { type: 'string', enum: ['strength', 'hypertrophy', 'mixed'] },
                  split: { type: 'string' },
                  confidence: { type: 'number' },
                  reason: { type: 'string' },
                },
                required: ['id', 'modality', 'goal', 'split'],
              },
            },
          },
          required: ['results'],
        },
      });
      for (const r of (res.results || [])) allResults.push(r);
    }

    const resultById = new Map(allResults.map((r) => [r.id, r]));

    const updates = [];
    const changeLog = [];
    for (const w of toClassify) {
      const r = resultById.get(w.id);
      if (!r) continue;
      const newModality = modalityValues.includes(r.modality) ? r.modality : 'mixed';
      const newGoal = ['strength', 'hypertrophy', 'mixed'].includes(r.goal) ? r.goal : 'mixed';
      const newSplit = r.split || w.oldSplit || '';
      const newEquipment = w.equipmentUnion.length ? w.equipmentUnion : w.oldEquipment;

      const changed = w.oldModality !== newModality || w.oldGoal !== newGoal || w.oldSplit !== newSplit
        || JSON.stringify(w.oldEquipment || []) !== JSON.stringify(newEquipment);

      updates.push({ id: w.id, modality: newModality, goal: newGoal, split: newSplit, equipment: newEquipment });
      changeLog.push({
        workout_id: w.workout_id,
        name: w.name,
        old: { modality: w.oldModality, goal: w.oldGoal, split: w.oldSplit, equipment: w.oldEquipment },
        new: { modality: newModality, goal: newGoal, split: newSplit, equipment: newEquipment },
        confidence: r.confidence,
        reason: r.reason,
        changed,
      });
    }

    for (let i = 0; i < updates.length; i += 500) {
      await base44.asServiceRole.entities.Workout.bulkUpdate(updates.slice(i, i + 500));
    }

    return Response.json({
      total: workoutData.length,
      classified: toClassify.length,
      runningPreserved: runningCount,
      updated: changeLog.filter((c) => c.changed).length,
      changes: changeLog,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function buildBatchPrompt(batch, modalityValues) {
  const workoutTexts = batch.map((w) => {
    const exList = w.exercises.length ? w.exercises : [{ name: 'no exercise data', reps: '?', equipment: '?', body_region: '?', movement_pattern: '?' }];
    const exLines = exList
      .map((e) => `  - ${e.name} | reps: ${e.reps} | equip: ${e.equipment} | region: ${e.body_region} | pattern: ${e.movement_pattern}`)
      .join('\n');
    return `WORKOUT ${w.id} (${w.workout_id}):
Name: ${w.name}
Format: ${w.format_label || w.workout_format || '?'} | Category: ${w.workout_category || '?'} | Difficulty: ${w.difficulty || '?'}
Exercises:
${exLines}`;
  }).join('\n\n');

  return `You are an expert strength & conditioning coach classifying workouts into training modalities, goals, and splits.

CLASSIFICATION GUIDE:
- modality: one of "${modalityValues.join('", "')}"
  - "strength": low-rep (1-5) heavy compound lifts, powerlifting-style, long rest (3-5 min)
  - "hypertrophy": moderate-rep (6-15) resistance training, bodybuilding splits, structured rest (60-90s)
  - "mixed": metcons/WODs/circuits/AMRAP/For-Time blending cardio + resistance (CrossFit-style)
  - "conditioning": primarily cardio/conditioning (rowing, cycling, jump rope, calisthenics circuits) with minimal heavy resistance
  - "running": running-focused sessions
  - "yoga"/"mobility": recovery, mobility, yoga flows
- goal: "strength" (maximal force, low reps), "hypertrophy" (muscle growth, 6-15 reps), "mixed" (varied/conditioning/metcon)
- split: concise label — "Push", "Pull", "Legs", "Upper", "Lower", "Full Body", "Posterior Chain", "Core", "Full Body Conditioning", "Cardio", etc.

KEY RULES:
- A "For Time" / AMRAP / EMOM WOD with barbell/dumbbell movements is "mixed" modality, NOT "strength" — even if it uses weights.
- True "strength" modality requires heavy, low-rep (1-5), long-rest compound lifting (squat/bench/deadlift/press).
- Bodybuilding splits (Push/Pull/Legs with 8-12 reps, moderate rest) are "hypertrophy" goal.
- If a workout has no exercise data, infer from name and format.

WORKOUTS TO CLASSIFY (use the Base44 id shown after "WORKOUT"):

${workoutTexts}

Return JSON with a "results" array, one entry per workout above, each { id, modality, goal, split, confidence, reason }.`;
}