import { supabase } from '@/lib/supabaseClient';
import { recomputeAndSaveFormatLabel } from '@/lib/formatLabel';
import { estimateStructureSeconds, adjustedDurationMinutes } from '@/lib/customDuration';

// Customizing never edits a shared catalog workout. The first change clones it
// into a private personal workout (public.customize_workout, premium only) and
// everything after that edits the clone in place.

/** Clone a workout for the caller (idempotent for one they already own as a private copy). */
export async function customizeWorkout(workoutUuid) {
  const { data, error } = await supabase.rpc('customize_workout', { p_workout_id: workoutUuid });
  if (error) throw error;
  return data;
}

/** True when a customize/clone call failed because the caller isn't premium. */
export function isPremiumRequiredError(error) {
  return error?.code === '42501' || /premium_required/.test(error?.message || '');
}

/** Saves a copy of a workout under a name the athlete chose (always a new workout, premium only). */
export async function saveWorkoutCopy(workoutUuid, name) {
  const { data, error } = await supabase.rpc('save_workout_copy', { p_workout_id: workoutUuid, p_name: name });
  if (error) throw error;
  return data;
}

export const isNameTakenError = (error) => error?.code === '23505' || /name_taken/.test(error?.message || '');
export const isInvalidNameError = (error) => error?.code === '22023' || /invalid_name/.test(error?.message || '');

/** Names of the athlete's own custom workouts (optionally leaving one out, e.g. the one being renamed). */
export async function fetchOwnCustomNames(userId, excludeId = null) {
  if (!userId) return [];
  const { data } = await supabase.from('workouts').select('id, name').eq('owner_id', userId).eq('status', 'private');
  return (data || []).filter((w) => w.id !== excludeId).map((w) => w.name);
}

export const isCustomWorkout = (workout) => !!workout && workout.status === 'private' && !!workout.owner_id;

const byNumber = (field) => (a, b) => (Number(a[field]) || 0) - (Number(b[field]) || 0);

/**
 * Maps every block exercise of a source workout to its counterpart in a clone,
 * by position (block order, then order within the block) — a clone gets fresh
 * codes but keeps the structure, so position is the stable identity.
 * @returns {Map<string, string>} source block_exercise_id -> clone block_exercise_id
 */
export function mapBlockExercises(srcBlocks, srcBlockExercises, dstBlocks, dstBlockExercises) {
  const map = new Map();
  const src = [...srcBlocks].sort(byNumber('order_index'));
  const dst = [...dstBlocks].sort(byNumber('order_index'));
  src.forEach((block, i) => {
    const dstBlock = dst[i];
    if (!dstBlock) return;
    const srcExs = srcBlockExercises.filter((be) => be.block_id === block.block_id).sort(byNumber('order_in_block'));
    const dstExs = dstBlockExercises.filter((be) => be.block_id === dstBlock.block_id).sort(byNumber('order_in_block'));
    srcExs.forEach((be, j) => {
      if (dstExs[j]) map.set(be.block_exercise_id, dstExs[j].block_exercise_id);
    });
  });
  return map;
}

/** Maps each source block to its clone counterpart by position (blocks keep their order in a clone). */
export function mapBlocks(srcBlocks, dstBlocks) {
  const src = [...srcBlocks].sort(byNumber('order_index'));
  const dst = [...dstBlocks].sort(byNumber('order_index'));
  const map = new Map();
  src.forEach((b, i) => { if (dst[i]) map.set(b.block_id, dst[i].block_id); });
  return map;
}

/**
 * Final block order for a clone: the blocks named in `listed` (clone block codes,
 * in the order the athlete ran them), with any block not named (e.g. a rest-only
 * block, which never shows up as an exercise) kept right after the block that
 * preceded it originally.
 */
export function orderBlocks(cloneBlocks, listed) {
  const original = [...cloneBlocks].sort(byNumber('order_index')).map((b) => b.block_id);
  const result = listed.filter((id, i) => original.includes(id) && listed.indexOf(id) === i);
  original.forEach((id, i) => {
    if (result.includes(id)) return;
    const prev = original.slice(0, i).reverse().find((p) => result.includes(p));
    result.splice(prev ? result.indexOf(prev) + 1 : 0, 0, id);
  });
  return result;
}

const newCode = (prefix) => `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;

async function fetchStructure(workoutCode) {
  const { data: blocks } = await supabase.from('workout_blocks').select('*').eq('workout_id', workoutCode);
  const blockIds = (blocks || []).map((b) => b.block_id);
  const { data: blockExercises } = blockIds.length
    ? await supabase.from('block_exercises').select('*').in('block_id', blockIds)
    : { data: [] };
  return { blocks: blocks || [], blockExercises: blockExercises || [] };
}

/** Make a block exercise's prescribed sets exactly `count` sets of `reps`. */
export async function setPrescribedSets(blockExerciseCode, count, reps) {
  const { data: existing } = await supabase.from('prescribed_sets').select('*').eq('block_exercise_id', blockExerciseCode);
  const sets = [...(existing || [])].sort(byNumber('set_number'));
  const target = Math.max(1, count);
  const numericReps = parseInt(reps, 10);
  if (!Number.isNaN(numericReps) && sets.length) {
    await Promise.all(sets.slice(0, target).map((s) => supabase.from('prescribed_sets').update({ target_reps: numericReps }).eq('id', s.id)));
  }
  if (sets.length > target) {
    await supabase.from('prescribed_sets').delete().in('id', sets.slice(target).map((s) => s.id));
  } else if (sets.length < target) {
    const fallbackReps = !Number.isNaN(numericReps) ? numericReps : (sets[0]?.target_reps ?? 8);
    await supabase.from('prescribed_sets').insert(
      Array.from({ length: target - sets.length }, (_, i) => ({
        set_id: newCode('SET'),
        block_exercise_id: blockExerciseCode,
        set_number: sets.length + i + 1,
        target_reps: fallbackReps,
      }))
    );
  }
}

/**
 * Writes a finished workout's on-the-spot changes into the athlete's private
 * copy of it, so next time starts from what they actually did.
 *
 * @param {object} args
 * @param {object} args.source   the workout that was run (a catalog workout, or already a private copy)
 * @param {object} args.clone    the private copy (same row as `source` when it already was one)
 * @param {Record<string, object>} args.swaps  original block_exercise_id -> exercises row swapped in
 * @param {Record<string, {sets:number, reps:string|number}>} args.edits  block_exercise_id -> new sets/reps
 * @param {Array<{key?:string, exercise:object, sets:number, reps:string|number}>} args.added  exercises added mid-workout, in order
 * @param {string[]} [args.sequence]  the order the athlete ran the workout in, as block ids of `source` (`added:<key>` for an added exercise)
 */
export async function applyOverridesToClone({ source, clone, swaps = {}, edits = {}, added = [], sequence }) {
  const cloneStructure = await fetchStructure(clone.workout_id);
  let toClone;
  let blockToClone;
  if (clone.id === source.id) {
    toClone = new Map(cloneStructure.blockExercises.map((be) => [be.block_exercise_id, be.block_exercise_id]));
    blockToClone = new Map(cloneStructure.blocks.map((b) => [b.block_id, b.block_id]));
  } else {
    const srcStructure = await fetchStructure(source.workout_id);
    toClone = mapBlockExercises(srcStructure.blocks, srcStructure.blockExercises, cloneStructure.blocks, cloneStructure.blockExercises);
    blockToClone = mapBlocks(srcStructure.blocks, cloneStructure.blocks);
  }

  for (const [origCode, exercise] of Object.entries(swaps)) {
    const target = toClone.get(origCode);
    if (!target) continue;
    await supabase.from('block_exercises').update({
      exercise_id: exercise.exercise_code || exercise.id,
      exercise_title_raw: exercise.name,
    }).eq('block_exercise_id', target);
  }

  for (const [origCode, edit] of Object.entries(edits)) {
    const target = toClone.get(origCode);
    if (!target) continue;
    const be = cloneStructure.blockExercises.find((x) => x.block_exercise_id === target);
    await supabase.from('block_exercises').update({
      prescription_value: String(edit.reps),
      // A ladder's reps live on these columns; a plain sets x reps edit replaces it.
      ladder_start_reps: null, ladder_end_reps: null, ladder_step: null, ladder_sequence: null,
    }).eq('block_exercise_id', target);
    // The runner treats an exercise alone in its block as `sets` rounds, so fold
    // any block-level rounds into the set count.
    if (be && (be.block_id)) {
      await supabase.from('workout_blocks').update({ rounds: 1 }).eq('block_id', be.block_id);
    }
    await setPrescribedSets(target, edit.sets, edit.reps);
  }

  let nextIndex = cloneStructure.blocks.length;
  const addedBlockByKey = new Map();
  for (const item of added) {
    const blockCode = newCode('BLK');
    if (item.key) addedBlockByKey.set(item.key, blockCode);
    const beCode = newCode('BE');
    const { error: blockError } = await supabase.from('workout_blocks').insert({
      workout_id: clone.workout_id,
      block_id: blockCode,
      order_index: nextIndex,
      block_label: String.fromCharCode(65 + nextIndex),
      block_type: 'standalone',
      rounds: 1,
    });
    if (blockError) throw blockError;
    nextIndex += 1;
    const { error: beError } = await supabase.from('block_exercises').insert({
      block_exercise_id: beCode,
      block_id: blockCode,
      step_type: 'exercise',
      exercise_id: item.exercise.exercise_code,
      exercise_title_raw: item.exercise.name,
      order_in_block: 0,
      prescription_value: String(item.reps),
    });
    if (beError) throw beError;
    await setPrescribedSets(beCode, item.sets, item.reps);
  }

  if (Array.isArray(sequence) && sequence.length) {
    const listed = sequence
      .map((id) => (id.startsWith('added:') ? addedBlockByKey.get(id.slice('added:'.length)) : blockToClone.get(id)))
      .filter(Boolean);
    const allBlocks = [...cloneStructure.blocks, ...[...addedBlockByKey.values()].map((block_id, i) => ({ block_id, order_index: cloneStructure.blocks.length + i }))];
    const finalOrder = orderBlocks(allBlocks, listed);
    for (let i = 0; i < finalOrder.length; i += 1) {
      await supabase.from('workout_blocks').update({ order_index: i, block_label: String.fromCharCode(65 + i) }).eq('block_id', finalOrder[i]);
    }
  }
}

async function fetchStructureWithSets(workoutCode) {
  const structure = await fetchStructure(workoutCode);
  const beCodes = structure.blockExercises.map((be) => be.block_exercise_id);
  const { data: sets } = beCodes.length
    ? await supabase.from('prescribed_sets').select('*').in('block_exercise_id', beCodes)
    : { data: [] };
  return { ...structure, sets: sets || [] };
}

/**
 * Re-estimates a custom workout's duration from its current structure: the
 * catalog workout's authored duration, plus however much longer or shorter the
 * copy is (see customDuration.js). Idempotent: always measured against the
 * original, never against a previous estimate. Returns the minutes, or null if
 * the workout isn't a copy of anything.
 */
export async function recomputeAndSaveDuration(workout) {
  if (!workout?.source_workout_id) return null;
  const [{ data: root }, source, copy] = await Promise.all([
    supabase.from('workouts').select('est_duration_min').eq('workout_id', workout.source_workout_id).maybeSingle(),
    fetchStructureWithSets(workout.source_workout_id),
    fetchStructureWithSets(workout.workout_id),
  ]);
  const minutes = adjustedDurationMinutes(
    root?.est_duration_min,
    estimateStructureSeconds(source.blocks, source.blockExercises, source.sets),
    estimateStructureSeconds(copy.blocks, copy.blockExercises, copy.sets)
  );
  await supabase.from('workouts').update({ est_duration_min: minutes }).eq('id', workout.id);
  return minutes;
}

/** Deletes one of the athlete's own custom workouts and everything under it. */
export async function deleteCustomWorkout(workout) {
  const { blocks, blockExercises } = await fetchStructure(workout.workout_id);
  const beCodes = blockExercises.map((be) => be.block_exercise_id);
  if (beCodes.length) await supabase.from('prescribed_sets').delete().in('block_exercise_id', beCodes);
  if (blocks.length) {
    await supabase.from('block_exercises').delete().in('block_id', blocks.map((b) => b.block_id));
    await supabase.from('workout_blocks').delete().eq('workout_id', workout.workout_id);
  }
  await supabase.from('workouts').delete().eq('id', workout.id);
}

/**
 * Saves a workout, with the changes the athlete made to it, as a NEW custom
 * workout under the name they picked. The original (catalog workout or earlier
 * copy) is never touched. If writing the changes fails part-way the half-built
 * copy is removed, so the name isn't left taken by a broken workout.
 */
export async function saveAsCustomWorkout({ source, name, swaps, edits, added, sequence }) {
  const copy = await saveWorkoutCopy(source.id, name);
  try {
    await applyOverridesToClone({ source, clone: copy, swaps, edits, added, sequence });
    await recomputeAndSaveFormatLabel(copy);
    await recomputeAndSaveDuration(copy);
  } catch (err) {
    try { await deleteCustomWorkout(copy); } catch { /* best effort */ }
    throw err;
  }
  return copy;
}

/**
 * Remembers on a session which custom workout it was saved as, so the session can show
 * "Saved as ..." instead of offering to save the same changes again.
 */
export async function markSessionSavedAs(sessionId, workout) {
  const { data } = await supabase.from('workout_sessions').select('progress').eq('id', sessionId).maybeSingle();
  const progress = { ...(data?.progress || {}), savedAs: { id: workout.id, name: workout.name } };
  await supabase.from('workout_sessions').update({ progress }).eq('id', sessionId);
}

/**
 * The custom workout a session was saved as, with its current name, or null if it was
 * never saved or the saved workout has since been deleted (then it can be saved again).
 */
export async function fetchSessionSavedAs(sessionId) {
  const { data: row } = await supabase.from('workout_sessions').select('progress').eq('id', sessionId).maybeSingle();
  const id = row?.progress?.savedAs?.id;
  if (!id) return null;
  const { data: workout } = await supabase.from('workouts').select('id, name').eq('id', id).maybeSingle();
  return workout ? { id: workout.id, name: workout.name } : null;
}
