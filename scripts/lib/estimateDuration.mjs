// Rough structural time estimate for a workout, shared by the static catalog audit
// (coaching-quality-audit.mjs) and the live execution agent (coaching-quality-agent.mjs)
// so both report the same number for "how long this should take if you follow every
// prescribed set and rest". There's no per-set timing data in the schema and
// est_duration_min/duration_minutes are purely author-entered (src/pages/Workouts.jsx)
// with nothing in the app cross-checking them — so this is deliberately a coarse
// average, good enough to flag a workout whose declared duration looks off, not an
// exact prediction.
const ASSUMED_SECONDS_PER_SET = 35;

// blocks: workout_blocks rows for one workout. exerciseCountByBlock: Map(block_id -> count).
export function estimateWorkoutMinutes(blocks, exerciseCountByBlock) {
  let seconds = 0;
  for (const b of blocks) {
    const exCount = exerciseCountByBlock.get(b.block_id) || 1;
    const rounds = b.rounds || 1;
    const perRoundWork = b.work_seconds ? b.work_seconds * exCount : ASSUMED_SECONDS_PER_SET * exCount;
    const perRoundRest = (b.rest_seconds || 0) * exCount;
    seconds += rounds * (perRoundWork + perRoundRest) + (b.rest_between_rounds_sec || 0);
  }
  return seconds / 60;
}

// A workout's declared duration is worth flagging when the structural estimate is
// off by both a relative and an absolute margin — relative alone over-fires on short
// workouts (a 10 vs 13 min workout is a 30% gap that nobody cares about), absolute
// alone under-fires on long ones.
export function isDurationMismatch(estimatedMinutes, declaredMinutes) {
  if (!(declaredMinutes > 0)) return false;
  const gap = Math.abs(estimatedMinutes - declaredMinutes);
  return gap / declaredMinutes > 0.25 && gap > 6;
}
