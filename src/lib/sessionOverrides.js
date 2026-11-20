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

export const hasSessionOverrides = ({ swaps = {}, edits = {}, added = [], reordered = false }) =>
  Object.keys(swaps).length > 0 || Object.keys(edits).length > 0 || added.length > 0 || reordered;

// ---- Order ---------------------------------------------------------------
// The runner treats consecutive exercises sharing a block_id as one unit (a
// superset/circuit's members must stay together), so reordering moves whole
// groups. A group's id is its block_id (`added:<key>` for an added exercise).

/** Splits the flat list into its contiguous block groups, in order. */
export function groupExercises(list) {
  const groups = [];
  list.forEach((e) => {
    const id = e.block_id ?? e.key;
    const last = groups[groups.length - 1];
    if (last && last.id === id) last.exercises.push(e);
    else groups.push({ id, exercises: [e] });
  });
  return groups;
}

export const sequenceOf = (list) => groupExercises(list).map((g) => g.id);

/**
 * Moves one upcoming group up or down among the upcoming groups. Groups that
 * are done or in progress (the current exercise's group and everything before
 * it) never move, so the athlete's position and logs stay valid.
 * Returns the same array when the move isn't possible.
 */
export function moveUpcomingGroup(list, currentIndex, groupId, direction) {
  const groups = groupExercises(list);
  const currentGroup = groups.findIndex((g) => g.exercises.includes(list[currentIndex]));
  const from = groups.findIndex((g) => g.id === groupId);
  const to = from + (direction === 'up' ? -1 : 1);
  if (from <= currentGroup || to <= currentGroup || to >= groups.length) return list;
  const next = [...groups];
  [next[from], next[to]] = [next[to], next[from]];
  return next.flatMap((g) => g.exercises);
}

/** Re-applies a saved group order. Groups missing from it keep their relative order at the end. */
export function applySequence(list, sequence) {
  if (!Array.isArray(sequence) || sequence.length === 0) return list;
  const groups = groupExercises(list);
  const rank = new Map(sequence.map((id, i) => [id, i]));
  const known = groups.filter((g) => rank.has(g.id)).sort((a, b) => rank.get(a.id) - rank.get(b.id));
  const unknown = groups.filter((g) => !rank.has(g.id));
  return [...known, ...unknown].flatMap((g) => g.exercises);
}

/** True when the groups that were in the original workout are no longer in their original relative order. */
export function isReordered(baseSequence, currentSequence) {
  const base = new Set(baseSequence);
  const kept = currentSequence.filter((id) => base.has(id));
  return kept.length !== baseSequence.length || kept.some((id, i) => id !== baseSequence[i]);
}

/**
 * Rebuilds what a finished session changed from its saved `progress`, so a past
 * session can still be saved as a custom workout. `baseList` is the workout's
 * exercises as saved (any objects with `key` = block_exercise_id, `block_id`, `order`).
 * Sessions from before the order was recorded get it derived from where the
 * added exercises were inserted.
 * @returns {{ swaps: object, edits: object, added: object[], sequence: string[]|undefined, has: boolean }}
 */
export function sessionOverridesFromProgress(progress, baseList) {
  const swaps = progress && typeof progress.swaps === 'object' && progress.swaps ? progress.swaps : {};
  const edits = progress && typeof progress.edits === 'object' && progress.edits ? progress.edits : {};
  const added = Array.isArray(progress?.added) ? progress.added : [];
  const saved = Array.isArray(progress?.sequence) && progress.sequence.length ? progress.sequence : null;
  const sequence = sequenceOf(applySequence(applyAddedExercises(baseList, added), saved));
  const reordered = isReordered(sequenceOf(baseList), sequence);
  return {
    swaps,
    edits,
    added,
    sequence: added.length || reordered ? sequence : undefined,
    has: hasSessionOverrides({ swaps, edits, added, reordered }),
  };
}
