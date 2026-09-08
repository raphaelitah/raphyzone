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
// 6:00/km (~9:39/mile) — a realistic pace for an average recreational runner,
// not an elite one. Applied to every distance-based prescription regardless
// of modality (running/rowing/biking/carries), so it's still a blend, just a
// more honest one for the common case (running) than a faster generic pace.
const SECONDS_PER_METER = 0.36;
// A loaded rep (an external free weight — barbell, dumbbells, kettlebell,
// weight plates) takes noticeably longer than an unloaded rep: grip, setup,
// and a more controlled tempo. This is an ALLOWLIST, not "anything but
// bodyweight" — apparatus like a Pull-up Bar, Step Box, or Slam Ball doesn't
// add the kind of external load that slows a rep down, even though it isn't
// "Bodyweight" either. Charleston 9 (Strict Pull-up, Wall Ball, Box Jump
// Step Down) is exactly the case an exclude-list gets wrong: only its one
// genuinely loaded movement (Dumbbell Power Clean) should get the penalty.
const WEIGHTED_REP_MULTIPLIER = 1.5;
const WEIGHTED_EQUIPMENT = new Set(['Barbell', 'EZ Bar', 'Dumbbells', 'Adjustable Dumbbells', 'Kettlebell', 'Weight Plates']);
function isWeighted(equipmentTags) {
  return (equipmentTags || []).some((t) => WEIGHTED_EQUIPMENT.has(t));
}
// Later work runs slower than earlier work — fatigue is real and a flat
// estimate ignores it entirely. Linear, not compounding: the i-th work unit
// (1-indexed) runs at (1 + 5% * (i-1)) of the base pace — capped at +50%,
// since real fatigue plateaus into a sustainable pace rather than climbing
// forever; left uncapped, a 44-round workout ("The Lou", a partner "you go/I
// go" grinder) came out at ~91x the base rate, roughly double its real
// length. Deliberately simple, not a physiological model.
//
// What counts as a "unit" differs by structure, and conflating them
// over-penalizes multi-exercise circuits: for a block with real repeated
// ROUNDS, one unit = one round (Helton: 3 units for 3 rounds of 800m run +
// 30 squat cleans + 30 burpees each) — that's validated and stays as-is.
// For a single un-rounded chipper, one unit = one exercise in the sequence
// ("The Don": 10 units for its 10 movements, ONE pass, no repeated rounds at
// all) — fatigue still accumulates over a long chipper, just not via
// "rounds" since there are none. Using per-EXERCISE units on a rounds-based
// block would make a round with 9 quick movements rack up 9x the fatigue-
// ramp of a round with 1 movement, which isn't real — see "Charleston 9" (9
// rounds x 9 exercises) overshooting badly under that approach.
const FATIGUE_RATE_PER_UNIT = 0.05;
const FATIGUE_CAP_MULTIPLIER = 1.5;
// Unit at which the linear ramp reaches the cap: 1 + rate*(k-1) = cap.
const FATIGUE_CAP_UNIT = Math.ceil((FATIGUE_CAP_MULTIPLIER - 1) / FATIGUE_RATE_PER_UNIT) + 1;
function fatigueMultiplier(unitIndex) {
  return Math.min(1 + FATIGUE_RATE_PER_UNIT * (unitIndex - 1), FATIGUE_CAP_MULTIPLIER);
}
// sum_{i=1}^{units} fatigueMultiplier(i), closed-form: units on the ramp
// (1..min(units, cap unit)) plus anything past the cap at the flat rate.
function fatigueMultiplierSum(units) {
  const k = Math.min(units, FATIGUE_CAP_UNIT);
  const rampSum = k + FATIGUE_RATE_PER_UNIT * (k * (k - 1)) / 2;
  const cappedUnits = Math.max(0, units - FATIGUE_CAP_UNIT);
  return rampSum + cappedUnits * FATIGUE_CAP_MULTIPLIER;
}

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
      if (reps == null) return null;
      const perRep = isWeighted(step?.equipment_tags) ? SECONDS_PER_REP * WEIGHTED_REP_MULTIPLIER : SECONDS_PER_REP;
      return reps * perRep;
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

    // Plain EMOM: every prescribed exercise is done within the SAME round
    // (e.g. "EMOM 30: 5 pull-ups, 10 push-ups, 15 squats" = 30 minutes
    // total, not 30 x 3 exercises). emom_alternating instead rotates ONE
    // exercise per round-long slot (e.g. 6 exercises x 4 rounds = 24
    // separate slots) — the two aren't interchangeable, so they need
    // different math despite both being "EMOM". Either way, an authored
    // time_cap_sec is the ground truth (same precedent as AMRAP below) —
    // it's needed for an "E2MOM" (every 2 min) or any other non-1-minute
    // round length, which a flat 60s/round assumption can't represent; see
    // "Flint" (15 E2MOM rounds, time_cap_sec 1800 = 30 min, not 15 min).
    if (b.workout_format === 'emom' || b.workout_format === 'emom_alternating') {
      if (b.time_cap_sec) {
        seconds += b.time_cap_sec;
      } else if (b.workout_format === 'emom') {
        seconds += rounds * EMOM_SECONDS_PER_SLOT;
      } else {
        seconds += rounds * exCount * EMOM_SECONDS_PER_SLOT;
      }
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
    const baseStepSeconds = steps.map((step) => (b.work_seconds ? b.work_seconds : estimateStepSeconds(step)));
    const hasStepData = baseStepSeconds.some((s) => s != null);
    if (!hasStepData && !hasRounds) {
      // Nothing structural (rounds) or reps-based to go on for this block —
      // e.g. a workout whose real scheme, like a descending ladder, isn't
      // captured in the prescription fields at all. The number below is a
      // pure guess; mark the whole estimate unreliable rather than
      // asserting it as a confident mismatch.
      reliable = false;
    }

    // Rest is tracked separately from work below — a tired athlete doesn't
    // get MORE rest, only slower work.
    const stepsForFatigue = baseStepSeconds.length ? baseStepSeconds : [null]; // exCount's "|| 1" equivalent
    const perRoundWorkUnfatigued = stepsForFatigue.reduce((sum, base) => sum + (base ?? ASSUMED_SECONDS_PER_SET), 0);
    let workSeconds;
    if (rounds > 1) {
      // Real repeated rounds: one fatigue unit = one round.
      workSeconds = perRoundWorkUnfatigued * fatigueMultiplierSum(rounds);
    } else {
      // A single un-rounded pass (a chipper): one fatigue unit = one
      // exercise in the sequence, since there are no rounds to key off.
      let unitIndex = 0;
      workSeconds = stepsForFatigue.reduce((sum, base) => {
        unitIndex += 1;
        return sum + (base ?? ASSUMED_SECONDS_PER_SET) * fatigueMultiplier(unitIndex);
      }, 0);
    }

    const perRoundRest = (b.rest_seconds || 0) * exCount;
    // rest_between_rounds_sec happens BETWEEN rounds, so an N-round block has
    // N-1 of them, not one flat addition regardless of round count.
    seconds += workSeconds + perRoundRest * rounds + Math.max(0, rounds - 1) * (b.rest_between_rounds_sec || 0);
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
