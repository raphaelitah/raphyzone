import { estimateStepSeconds } from '@/lib/estimateDuration';

// How long a customized workout takes, given how long the original is declared to take.
//
// The catalog's est_duration_min is authored. A customized copy starts out with the
// same number, so adding three exercises left it saying "30 min". We don't replace
// the authored number with a model (the model is coarse and would disagree with the
// author even on an unchanged workout); we keep it and add the *difference* between
// a structural estimate of the copy and of the original. Whatever the model gets
// wrong about the shared part cancels out, and unchanged copies stay exactly as
// authored.

const DEFAULT_SECONDS_PER_SET = 35;
// Rest between sets when the block doesn't say (the runner uses 60s for exercises
// added mid-workout; many catalog blocks leave it blank).
const DEFAULT_REST_BETWEEN_SETS = 45;
const TIMED_FORMATS = new Set(['emom', 'emom_alternating', 'amrap']);

// Added exercises are stored with just a prescription_value ("10", "60s"), no
// prescription_type, so work out which it is before handing it to the shared estimator.
function withInferredType(step, firstSetReps) {
  if (step.prescription_type) return step;
  const value = String(step.prescription_value ?? '').trim().toLowerCase();
  if (/^\d+(\.\d+)?\s*(s|sec|secs|seconds?|m|min|mins|minutes?)$/.test(value) && !/\d\s*m$/.test(value)) {
    return { ...step, prescription_type: 'time' };
  }
  if (/^\d+(\.\d+)?$/.test(value)) return { ...step, prescription_type: 'reps' };
  if (firstSetReps != null) return { ...step, prescription_type: 'reps', prescription_value: String(firstSetReps) };
  return step;
}

/**
 * Rough seconds for a whole workout structure, counting every prescribed set.
 * @param {object[]} blocks            workout_blocks rows
 * @param {object[]} blockExercises    block_exercises rows (any step type)
 * @param {object[]} prescribedSets    prescribed_sets rows
 */
export function estimateStructureSeconds(blocks, blockExercises, prescribedSets = []) {
  const setsByBe = new Map();
  prescribedSets.forEach((s) => {
    if (!setsByBe.has(s.block_exercise_id)) setsByBe.set(s.block_exercise_id, []);
    setsByBe.get(s.block_exercise_id).push(s);
  });
  let seconds = 0;
  const ordered = [...blocks].sort((a, b) => (Number(a.order_index) || 0) - (Number(b.order_index) || 0));
  ordered.forEach((block) => {
    // A timed block fills its cap by definition.
    if (TIMED_FORMATS.has(block.workout_format) && block.time_cap_sec) {
      seconds += Number(block.time_cap_sec);
      return;
    }
    const rounds = Math.max(1, Number(block.rounds) || 1);
    const rest = block.rest_between_rounds_sec != null ? Number(block.rest_between_rounds_sec) : DEFAULT_REST_BETWEEN_SETS;
    const steps = blockExercises
      .filter((be) => be.block_id === block.block_id)
      .sort((a, b) => (Number(a.order_in_block) || 0) - (Number(b.order_in_block) || 0));
    steps.forEach((be) => {
      if (be.step_type === 'rest') {
        seconds += estimateStepSeconds({ prescription_type: 'time', prescription_value: be.prescription_value }) ?? 0;
        return;
      }
      if (be.step_type !== 'exercise') return;
      const sets = setsByBe.get(be.block_exercise_id) || [];
      const units = Math.max(1, sets.length) * rounds;
      const perSet = estimateStepSeconds(withInferredType(be, sets[0]?.target_reps)) ?? DEFAULT_SECONDS_PER_SET;
      seconds += units * perSet + Math.max(0, units - 1) * rest;
    });
  });
  return seconds;
}

/**
 * Declared minutes for a copy: the original's declared duration plus however much
 * longer (or shorter) the copy's structure is. Never below 5 minutes.
 * With no declared duration to start from, falls back to the structural estimate.
 */
export function adjustedDurationMinutes(declaredMinutes, sourceSeconds, copySeconds) {
  const declared = Number(declaredMinutes);
  if (!(declared > 0)) return Math.max(5, Math.round(copySeconds / 60));
  return Math.max(5, Math.round(declared + (copySeconds - sourceSeconds) / 60));
}
