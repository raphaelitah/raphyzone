import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { getUserFromRequest } from './_shared/auth.ts';
import { getServiceClient } from './_shared/supabaseAdmin.ts';
import { callLLM } from './_shared/llm.ts';
import { corsHeaders } from './_shared/cors.ts';

// Ported from the Base44-era base44/functions/classifyWorkoutCatalog/entry.ts,
// which used base44.asServiceRole.entities.* and base44.integrations.Core.InvokeLLM.
// Those platform APIs no longer exist post-migration to Supabase, so this rebuilds
// the same classification pass (modality/goal/split/equipment) against the
// workouts/workout_blocks/block_exercises/exercises tables, using the shared
// Groq-backed callLLM helper.
//
// Input: { workout_ids?: string[] } — if provided, scopes the pass to exactly
// those workout_id values (used for classifying a freshly-imported batch without
// touching already-classified workouts). If omitted, classifies every
// status='approved' workout, matching the original Base44 behavior.

const BATCH_SIZE = 5;

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const user = await getUserFromRequest(req);
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401, headers: corsHeaders });

    const admin = getServiceClient();
    const { data: profile } = await admin.from('profiles').select('role').eq('id', user.id).single();
    if (!profile || profile.role !== 'admin') {
      return Response.json({ error: 'Admin only' }, { status: 403, headers: corsHeaders });
    }

    const body = await req.json().catch(() => ({}));
    const workoutIds: string[] | undefined = Array.isArray(body.workout_ids) ? body.workout_ids : undefined;

    let workoutsQuery = admin.from('workouts').select('id, workout_id, name, workout_format, format_label, workout_category, difficulty, modality, goal, split, equipment').eq('status', 'approved');
    if (workoutIds) workoutsQuery = workoutsQuery.in('workout_id', workoutIds);
    const { data: workouts, error: wErr } = await workoutsQuery;
    if (wErr) throw wErr;
    if (!workouts?.length) return Response.json({ total: 0, classified: 0, runningPreserved: 0, updated: 0, changes: [] }, { headers: corsHeaders });

    const workoutCodes = workouts.map((w) => w.workout_id);
    const [{ data: blocks, error: bErr }, { data: modalityTerms }] = await Promise.all([
      admin.from('workout_blocks').select('block_id, workout_id').in('workout_id', workoutCodes),
      admin.from('taxonomy_terms').select('value').eq('dimension', 'modality'),
    ]);
    if (bErr) throw bErr;

    const modalityValues = (modalityTerms || []).map((t: any) => t.value).filter(Boolean);
    if (!modalityValues.length) modalityValues.push('strength', 'conditioning', 'running', 'mixed', 'yoga', 'mobility');

    const blockIds = (blocks || []).map((b: any) => b.block_id);
    const { data: blockExs, error: beErr } = blockIds.length
      ? await admin.from('block_exercises').select('block_id, step_type, exercise_id, exercise_title_raw, prescription_value').in('block_id', blockIds)
      : { data: [], error: null };
    if (beErr) throw beErr;

    const exerciseCodes = [...new Set((blockExs || []).map((be: any) => be.exercise_id).filter(Boolean))];
    const { data: exercises, error: eErr } = exerciseCodes.length
      ? await admin.from('exercises').select('exercise_code, name, equipment, body_region, movement_pattern').in('exercise_code', exerciseCodes)
      : { data: [], error: null };
    if (eErr) throw eErr;

    const exerciseByCode = new Map((exercises || []).map((e: any) => [e.exercise_code, e]));
    const blockExsByBlock = new Map<string, any[]>();
    for (const be of blockExs || []) {
      if (!blockExsByBlock.has(be.block_id)) blockExsByBlock.set(be.block_id, []);
      blockExsByBlock.get(be.block_id)!.push(be);
    }
    const blocksByWorkoutCode = new Map<string, any[]>();
    for (const b of blocks || []) {
      if (!blocksByWorkoutCode.has(b.workout_id)) blocksByWorkoutCode.set(b.workout_id, []);
      blocksByWorkoutCode.get(b.workout_id)!.push(b);
    }

    const workoutData = workouts.map((w) => {
      const isRunning = /^run\b/i.test((w.name || '').trim());
      const wBlocks = blocksByWorkoutCode.get(w.workout_id) || [];
      const beList = wBlocks.flatMap((b) => blockExsByBlock.get(b.block_id) || []);
      const exMeta = beList
        .filter((be) => be.step_type === 'exercise' && be.exercise_id)
        .map((be) => exerciseByCode.get(be.exercise_id))
        .filter(Boolean);
      const equipmentUnion = [...new Set(exMeta.map((e: any) => e.equipment).filter(Boolean))]
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

    const batches: (typeof toClassify)[] = [];
    for (let i = 0; i < toClassify.length; i += BATCH_SIZE) batches.push(toClassify.slice(i, i + BATCH_SIZE));

    // Apply each batch's DB updates immediately after that batch's LLM call
    // succeeds, and swallow a failed batch (most commonly Groq's free-tier
    // 8000 TPM rate limit) rather than aborting the whole run — otherwise one
    // exhausted batch discards every already-classified batch before it. The
    // caller re-invokes with just `failedWorkoutIds` after a cooldown.
    const changeLog: any[] = [];
    const failedWorkoutIds: string[] = [];
    let batchErrors = 0;

    for (const [batchIdx, batch] of batches.entries()) {
      if (batchIdx > 0) await new Promise((resolve) => setTimeout(resolve, 4000));
      const prompt = buildBatchPrompt(batch, modalityValues);
      let results: any[];
      try {
        const res = await callLLM({
          functionName: 'classifyWorkoutCatalog',
          prompt,
          schema: {
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
        results = res.results || [];
      } catch (batchErr) {
        batchErrors++;
        for (const w of batch) failedWorkoutIds.push(w.workout_id);
        continue;
      }

      const resultById = new Map(results.map((r) => [r.id, r]));
      for (const w of batch) {
        const r = resultById.get(w.id);
        if (!r) { failedWorkoutIds.push(w.workout_id); continue; }
        const newModality = modalityValues.includes(r.modality) ? r.modality : 'mixed';
        const newGoal = ['strength', 'hypertrophy', 'mixed'].includes(r.goal) ? r.goal : 'mixed';
        const newSplit = r.split || w.oldSplit || '';
        const newEquipment = w.equipmentUnion.length ? w.equipmentUnion : w.oldEquipment;

        const changed = w.oldModality !== newModality || w.oldGoal !== newGoal || w.oldSplit !== newSplit
          || JSON.stringify(w.oldEquipment || []) !== JSON.stringify(newEquipment);

        if (changed) {
          const { error: uErr } = await admin.from('workouts').update({
            modality: newModality, goal: newGoal, split: newSplit, equipment: newEquipment, updated_date: new Date().toISOString(),
          }).eq('id', w.id);
          if (uErr) throw uErr;
        }

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
    }

    return Response.json({
      total: workoutData.length,
      classified: changeLog.length,
      runningPreserved: runningCount,
      updated: changeLog.filter((c) => c.changed).length,
      batchErrors,
      failedWorkoutIds,
      changes: changeLog,
    }, { headers: corsHeaders });
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500, headers: corsHeaders });
  }
});

function buildBatchPrompt(batch: any[], modalityValues: string[]) {
  const workoutTexts = batch.map((w) => {
    const exList = w.exercises.length ? w.exercises : [{ name: 'no exercise data', reps: '?', equipment: '?', body_region: '?', movement_pattern: '?' }];
    const exLines = exList
      .map((e: any) => `  - ${e.name} | reps: ${e.reps} | equip: ${e.equipment} | region: ${e.body_region} | pattern: ${e.movement_pattern}`)
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

WORKOUTS TO CLASSIFY (use the id shown after "WORKOUT"):

${workoutTexts}

Return JSON with a "results" array, one entry per workout above, each { id, modality, goal, split, confidence, reason }.`;
}
