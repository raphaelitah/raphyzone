// On-the-spot changes an athlete makes while running a workout (premium):
//   edits  – new sets/reps for an exercise, keyed by its block_exercise_id
//   added  – exercises added mid-workout, each remembering which exercise it was added after
// Both live in workout_sessions.progress so a reload re-applies them, and can be
// written into the athlete's private copy of the workout afterwards
// (see applyOverridesToClone in customizeWorkout.js).
// These are pure helpers over the flat exercise list WorkoutExecution renders.

/** The key an exercise keeps for its whole life, even after a swap re-keys it. */
export const stableKey = (e) => e.addedKey ?? e.swapOrigin ?? e.key;

/** Applies a sets x reps edit to a flat exercise (an exercise alone in its block runs as `sets` rounds). */
export function applyEditToExercise(e, edit) {
  if (!edit) return e;
  const sets = Math.max(1, parseInt(edit.sets, 10) || 1);
  return { ...e, sets, rounds: 1, effective_sets: sets, reps: String(edit.reps), reps_label: null, ladder: null };
}

/** A flat-list entry for an exercise added mid-workout: a standalone exercise in its own block. */
export function buildAddedExercise(item, order) {
  const sets = Math.max(1, parseInt(item.sets, 10) || 1);
  const ex = item.exercise;
  return {
    exercise_id: ex.exercise_code,
    exercise_name: ex.name,
    sets,
    rounds: 1,
    effective_sets: sets,
    reps: String(item.reps),
    reps_label: null,
    ladder: null,
    target_weight: item.target_weight ?? null,
    rest_seconds: 60,
    coach_note: '',
    prescription_type: null,
    order,
    details: ex,
    key: item.key,
    addedKey: item.key,
    block_id: `added:${item.key}`,
    block_type: null,
    workout_format: null,
    block_rounds: null,
    time_cap_sec: null,
    work_seconds: null,
    block_rest_seconds: null,
  };
}

/**
 * Inserts an added exercise right after the block containing the exercise it
 * was added after (never in the middle of a superset/circuit), or at the end if
 * that exercise is gone. `order` is unique and stable, so saved exercise rows
 * keep matching after a reload.
 */
export function insertAddedExercise(list, item) {
  const order = list.reduce((max, e) => Math.max(max, e.order ?? -1), -1) + 1;
  const entry = buildAddedExercise(item, order);
  const anchor = list.findIndex((e) => stableKey(e) === item.afterKey);
  if (anchor === -1) return [...list, entry];
  const blockId = list[anchor].block_id;
  let end = anchor;
  while (end + 1 < list.length && blockId != null && list[end + 1].block_id === blockId) end += 1;
  return [...list.slice(0, end + 1), entry, ...list.slice(end + 1)];
}

/** Re-applies saved added exercises, in the order they were added. */
export function applyAddedExercises(list, added = []) {
  return added.reduce((acc, item) => insertAddedExercise(acc, item), list);
}

export const hasSessionOverrides = ({ swaps = {}, edits = {}, added = [] }) =>
  Object.keys(swaps).length > 0 || Object.keys(edits).length > 0 || added.length > 0;
