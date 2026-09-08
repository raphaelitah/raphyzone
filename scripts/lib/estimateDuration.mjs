// Rough structural time estimate for a workout, shared by the static catalog audit
// (coaching-quality-audit.mjs) and the live execution agent (coaching-quality-agent.mjs)
// so both report the same number for "how long this should take if you follow every
// prescribed set and rest". There's no per-set timing data in the schema and
// est_duration_min/duration_minutes are purely author-entered (src/pages/Workouts.jsx)
// with nothing in the app cross-checking them — so this is deliberately a coarse
// average, good enough to flag a workout whose declared duration looks off, not an
// exact prediction.
const ASSUMED_SECONDS_PER_SET = 35;
// EMOM ("every minute on the minute") fixes each exercise to exactly one
// 60-second slot by definition, regardless of how long the prescribed work
// actually takes — the rest of the minute is rest. The generic per-set/rest
// math below doesn't apply to that format.
const EMOM_SECONDS_PER_SLOT = 60;
// Coarse per-unit paces for scaling a single "for time" step by what it
// actually prescribes (reps/time/distance) instead of treating every step as
// one flat 35-second set regardless of whether it's 5 reps or 100 — see
// "Jason" (100/75/50/25 Air Squat + 5/10/15/20 Muscle-Up) vs "Bellzebub"
// (no prescription_value recorded at all) in the coaching-quality audit.
const SECONDS_PER_REP = 3;
const SECONDS_PER_METER = 0.3;

function parseNumber(value) {
  if (value == null) return null;
  // Strip thousands separators first ("2,000m" is 2000, not 2) — without
  // this the regex below stops at the comma and silently truncates to "2".
  const match = String(value).replace(/,/g, '').match(/-?\d+(\.\d+)?/);
  return match ? parseFloat(match[0]) : null;
}

const METERS_PER_MILE = 1609.34;

function parseSecondsFromTimeValue(value) {
  if (value == null) return null;
  const str = String(value).toLowerCase();
  const mmss = str.match(/^(\d+):(\d{2})$/);
  if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
  const n = parseNumber(str);
  if (n == null) return null;
  return str.includes('min') ? n * 60 : n; // bare numbers/"...seconds"/"...s" assumed seconds
}

// Ties the unit to the SAME number it follows, rather than asking "does this
// string mention km/miles anywhere" — a value like "1200m (0.75 mile)" is a
// meters figure with a human-readable mile conversion in parens, and a naive
// string.includes('mile') check would wrongly apply the mile multiplier to
// the leading 1200 (turning ~360m/min pace into ~9600 minutes).
function parseMetersFromDistanceValue(value) {
  if (value == null) return null;
  const str = String(value).toLowerCase().replace(/,/g, '');
  const match = str.match(/(-?\d+(?:\.\d+)?)\s*(mi|miles?|km|m)\b/);
  if (!match) return parseNumber(str); // no unit attached — assume meters
  const n = parseFloat(match[1]);
  const unit = match[2];
  if (unit === 'km') return n * 1000;
  if (unit === 'mi' || unit.startsWith('mile')) return n * METERS_PER_MILE;
  return n; // 'm'
}

// Seconds for one exercise step based on its own prescription, or null when
// there's nothing recorded to go on (no reps/time/distance value at all).
function estimateStepSeconds(step) {
  const value = step?.prescription_value;
  switch (step?.prescription_type) {
    case 'reps': {
      const reps = parseNumber(value);
      return reps != null ? reps * SECONDS_PER_REP : null;
    }
    case 'time':
      return parseSecondsFromTimeValue(value);
    case 'distance': {
      const meters = parseMetersFromDistanceValue(value);
      return meters != null ? meters * SECONDS_PER_METER : null;
    }
    default:
      return null;
  }
}

// blocks: workout_blocks rows for one workout.
// exercisesByBlock: Map(block_id -> block_exercises rows, each needing at
// least prescription_type/prescription_value; step_type !== 'exercise' rows
// must already be filtered out by the caller).
//
// Returns { minutes, reliable }. `reliable` is false when at least one block
// had neither an explicit `rounds` count nor any per-step prescription data
// to go on — i.e. the number is a pure guess (one flat assumed set per
// exercise), not a structural read of the workout, and callers should treat
// it as "can't verify" rather than a confident mismatch.
export function estimateWorkoutMinutes(blocks, exercisesByBlock) {
  let seconds = 0;
  let reliable = true;
  for (const b of blocks) {
    const steps = exercisesByBlock.get(b.block_id) || [];
    const exCount = steps.length || 1;
    const hasRounds = b.rounds != null;
    const rounds = b.rounds || 1;

    // Plain EMOM: every prescribed exercise is done within the SAME 60-second
    // round (e.g. "EMOM 30: 5 pull-ups, 10 push-ups, 15 squats" = 30 minutes
    // total, not 30 x 3 exercises). emom_alternating instead rotates ONE
    // exercise per minute-long slot (e.g. 6 exercises x 4 rounds = 24
    // separate minutes) — the two aren't interchangeable, so they need
    // different math despite both being "EMOM".
    if (b.workout_format === 'emom') {
      seconds += rounds * EMOM_SECONDS_PER_SLOT;
      continue;
    }
    if (b.workout_format === 'emom_alternating') {
      seconds += rounds * exCount * EMOM_SECONDS_PER_SLOT;
      continue;
    }

    // AMRAP ("as many rounds/reps as possible") duration is exactly its
    // authored time cap by definition — the point is you fill the whole cap,
    // not something derivable from rep counts. Trust time_cap_sec when set.
    if (b.workout_format === 'amrap' && b.time_cap_sec) {
      seconds += b.time_cap_sec;
      continue;
    }

    // Prefer what's actually prescribed per exercise (reps/time/distance)
    // over a flat per-exercise guess — a 5-rep heavy set and a 20-rep
    // bodyweight set aren't the same length just because they're both "one
    // set", and this applies whether the block is a rounds-based strength
    // block or an un-rounded "for time" chipper. An explicit authored
    // work_seconds (a timed interval/circuit) is the coach's own stated
    // timing and takes priority over guessing from reps.
    let perRoundWork;
    if (b.work_seconds) {
      perRoundWork = b.work_seconds * exCount;
    } else {
      const stepSeconds = steps.map(estimateStepSeconds);
      if (stepSeconds.some((s) => s != null)) {
        perRoundWork = stepSeconds.reduce((sum, s) => sum + (s ?? ASSUMED_SECONDS_PER_SET), 0);
      } else {
        perRoundWork = ASSUMED_SECONDS_PER_SET * exCount;
        // Nothing structural (rounds) or reps-based to go on for this block —
        // e.g. a workout whose real scheme, like a descending ladder, isn't
        // captured in the prescription fields at all. The number below is a
        // pure guess; mark the whole estimate unreliable rather than
        // asserting it as a confident mismatch.
        if (!hasRounds) reliable = false;
      }
    }

    const perRoundRest = (b.rest_seconds || 0) * exCount;
    // rest_between_rounds_sec happens BETWEEN rounds, so an N-round block has
    // N-1 of them, not one flat addition regardless of round count.
    seconds += rounds * (perRoundWork + perRoundRest) + Math.max(0, rounds - 1) * (b.rest_between_rounds_sec || 0);
  }
  return { minutes: seconds / 60, reliable };
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
