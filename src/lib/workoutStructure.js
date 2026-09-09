// Helpers for building workout structure from normalized entities
// (Workout → WorkoutBlock → BlockExercise → PrescribedSet)

export function buildBlocksByWorkout(blocks) {
  const map = {};
  blocks.forEach((b) => {
    if (!map[b.workout_id]) map[b.workout_id] = [];
    map[b.workout_id].push(b);
  });
  Object.values(map).forEach((arr) =>
    arr.sort((a, b) => (a.order_index || 0) - (b.order_index || 0))
  );
  return map;
}

export function buildBlockExercisesByBlock(blockExercises) {
  const map = {};
  blockExercises.forEach((be) => {
    if (!map[be.block_id]) map[be.block_id] = [];
    map[be.block_id].push(be);
  });
  Object.values(map).forEach((arr) =>
    arr.sort((a, b) => (a.order_in_block || 0) - (b.order_in_block || 0))
  );
  return map;
}

export function buildSetsByBlockExercise(prescribedSets) {
  const map = {};
  prescribedSets.forEach((ps) => {
    if (!map[ps.block_exercise_id]) map[ps.block_exercise_id] = [];
    map[ps.block_exercise_id].push(ps);
  });
  Object.values(map).forEach((arr) =>
    arr.sort((a, b) => (a.set_number || 0) - (b.set_number || 0))
  );
  return map;
}

export function buildExerciseMapByCode(exercises) {
  const map = {};
  exercises.forEach((e) => {
    if (e.exercise_code) map[e.exercise_code] = e;
  });
  return map;
}

export function countWorkoutExercises(workout, blocksByWorkout, blockExercisesByBlock) {
  const blocks = blocksByWorkout[workout.workout_id] || [];
  let count = 0;
  blocks.forEach((b) => {
    const exs = blockExercisesByBlock[b.block_id] || [];
    count += exs.filter((be) => be.step_type === 'exercise').length;
  });
  return count;
}

export function buildFlatExerciseList(
  workout,
  blocksByWorkout,
  blockExercisesByBlock,
  setsByBlockExercise,
  exerciseMap
) {
  const blocks = blocksByWorkout[workout.workout_id] || [];
  const list = [];
  let order = 0;
  blocks.forEach((block) => {
    const blockExs = (blockExercisesByBlock[block.block_id] || []).filter(
      (be) => be.step_type === 'exercise'
    );
    blockExs.forEach((be) => {
      const sets = setsByBlockExercise[be.block_exercise_id] || [];
      const setCount = sets.length || 1;
      const ladder = getLadderSequence(be);
      const reps = ladder ? ladder.join('-') : (sets[0]?.target_reps?.toString() || be.prescription_value || '');
      const targetWeight = be.load_value ? parseFloat(be.load_value) : null;
      const details = exerciseMap[be.exercise_id] || null;
      const rounds = getEffectiveRounds(block, blockExs.length, blockExs);
      list.push({
        exercise_id: be.exercise_id,
        // exercise_title_raw is the per-step authored text (e.g. a progressive
        // interval workout distinguishing "Treadmill Run (10% incline)" from
        // "Treadmill Run (12% incline)" across steps that share one catalog
        // exercise_id) — prefer it over the catalog's generic details.name,
        // which would otherwise silently collapse every step back to the same
        // undifferentiated "Treadmill Run" on screen.
        exercise_name: be.exercise_title_raw || details?.name || 'Exercise',
        sets: setCount,
        rounds,
        effective_sets: rounds * setCount,
        reps,
        ladder,
        target_weight: targetWeight,
        rest_seconds: block.rest_between_rounds_sec ?? null,
        coach_note: be.notes || '',
        order: order++,
        details,
        key: be.block_exercise_id,
        block_id: block.block_id,
        block_type: block.block_type || null,
        workout_format: block.workout_format || null,
        block_rounds: block.rounds ?? null,
        time_cap_sec: block.time_cap_sec ?? null,
        work_seconds: block.work_seconds ?? null,
        block_rest_seconds: block.rest_seconds ?? null,
      });
    });
  });
  return list;
}

export function roundToFive(minutes) {
  if (!minutes) return 0;
  return Math.round(minutes / 5) * 5;
}

export function isEMOMBlock(block) {
  const type = (block.block_type || '').toLowerCase();
  const format = (block.workout_format || '').toLowerCase();
  return type === 'emom' || format === 'emom' || type === 'emom_alternating' || format === 'emom_alternating';
}

// A rotating EMOM: one exercise per round (e.g. "Alternating EMOM x9" cycling
// through 3 movements), as opposed to the default of the whole block's
// exercises done together every round.
export function isAlternatingEmomBlock(block) {
  const type = (block.block_type || '').toLowerCase();
  const format = (block.workout_format || '').toLowerCase();
  return type === 'emom_alternating' || format === 'emom_alternating';
}

export function getEMOMMinutes(block) {
  return block.time_cap_sec ? Math.round(block.time_cap_sec / 60) : 0;
}

export function isTabataBlock(block) {
  const type = (block.block_type || '').toLowerCase();
  const format = (block.workout_format || '').toLowerCase();
  return type === 'tabata' || format === 'tabata';
}

// Builds the round-by-round rep sequence for a ladder-style block exercise,
// e.g. ladder_start_reps=10, ladder_end_reps=1, ladder_step=1 → [10,9,...,1].
// Returns null when the exercise isn't configured as a ladder. An explicit
// ladder_sequence (for a non-arithmetic ladder, e.g. a 1-2-...-10-...-2-1
// pyramid or a 21-15-9-9-15-21 palindrome) always wins over start/end/step.
export function getLadderSequence(be) {
  if (Array.isArray(be?.ladder_sequence) && be.ladder_sequence.length > 1) {
    return be.ladder_sequence;
  }
  const start = be?.ladder_start_reps;
  const end = be?.ladder_end_reps;
  const step = Math.abs(be?.ladder_step) || 1;
  if (start == null || end == null || start === end) return null;
  const seq = [];
  if (start > end) {
    for (let r = start; r >= end; r -= step) seq.push(r);
  } else {
    for (let r = start; r <= end; r += step) seq.push(r);
  }
  return seq.length > 1 ? seq : null;
}

// Accepts either a raw block_exercise row (with ladder_start_reps/_end_reps/
// _step) or a flat exercise-list item that already carries a precomputed
// `ladder` array — so the same round-count/reps-lookup logic works both when
// building the flat list and later, in the execution UI, from that list.
function ladderSequenceOf(item) {
  if (Array.isArray(item?.ladder)) return item.ladder;
  return getLadderSequence(item);
}

export function isLadderBlock(items) {
  return (items || []).some((it) => (ladderSequenceOf(it) || []).length > 1);
}

export function getLadderRounds(items) {
  const lens = (items || []).map((it) => ladderSequenceOf(it)?.length || 0);
  return lens.length ? Math.max(...lens) : 0;
}

// Reps due on a given 1-indexed round for a ladder exercise; clamps to the
// last rung if asked for a round past the ladder's length.
export function getLadderRepsForRound(item, round) {
  const seq = ladderSequenceOf(item);
  if (!seq || !seq.length) return null;
  return seq[Math.min(Math.max(round, 1), seq.length) - 1];
}

export function isSupersetBlock(block) {
  const type = (block.block_type || '').toLowerCase();
  const format = (block.workout_format || '').toLowerCase();
  return type === 'superset' || format === 'superset';
}

export function isAMRAPBlock(block) {
  const format = (block.workout_format || '').toLowerCase();
  return format === 'amrap';
}

export function isCircuitBlock(block) {
  const type = (block.block_type || '').toLowerCase();
  return type === 'circuit';
}

// A circuit only needs to rotate exercise-by-exercise when it repeats: a
// single pass through (the default, block.rounds unset or 1) is already a
// straight sequential list, no different from any other for-time block. Once
// rounds > 1 (e.g. Barbara's "5 rounds for time"), the athlete must do one
// rep of each movement in order, then loop back to the first for the next
// round — not finish every rep of movement A before moving to B.
export function isRotatingCircuitBlock(block) {
  return isCircuitBlock(block) && (block.rounds || 1) > 1;
}

export function countWorkoutRests(workout, blocksByWorkout, blockExercisesByBlock) {
  const blocks = blocksByWorkout[workout.workout_id] || [];
  let count = 0;
  blocks.forEach((b) => {
    const exs = blockExercisesByBlock[b.block_id] || [];
    count += exs.filter((be) => be.step_type === 'rest').length;
  });
  return count;
}

export function getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock) {
  const exerciseCount = countWorkoutExercises(workout, blocksByWorkout, blockExercisesByBlock);
  const restCount = countWorkoutRests(workout, blocksByWorkout, blockExercisesByBlock);
  const blocks = blocksByWorkout[workout.workout_id] || [];
  const emomBlock = blocks.find((b) => isEMOMBlock(b));

  const parts = [`${exerciseCount} ${exerciseCount === 1 ? 'Exercise' : 'Exercises'}`];
  if (restCount > 0) {
    parts.push(`${restCount} ${restCount === 1 ? 'Rest' : 'Rests'}`);
  }
  if (emomBlock && emomBlock.rounds) {
    const emomExerciseCount = (blockExercisesByBlock[emomBlock.block_id] || []).filter(
      (be) => be.step_type === 'exercise'
    ).length;
    const rotates = isAlternatingEmomBlock(emomBlock) || emomExerciseCount > 1;
    const denominator = rotates ? emomExerciseCount : 1;
    if (denominator > 0) {
      const rounds = Math.round(emomBlock.rounds / denominator);
      parts.push(`${rounds} ${rounds === 1 ? 'Round' : 'Rounds'}`);
    }
  }
  return parts.join(' · ');
}

export function getEffectiveRounds(block, exerciseCount, blockExs = null) {
  if (blockExs && isLadderBlock(blockExs)) {
    const ladderRounds = getLadderRounds(blockExs);
    if (ladderRounds > 0) return ladderRounds;
  }
  if (isEMOMBlock(block) && exerciseCount > 0) {
    const mins = getEMOMMinutes(block);
    if (mins > 0) return Math.floor(mins / exerciseCount);
  }
  // AMRAP's `rounds`, when set, is only a coach-set target for as-many-as-
  // possible work — not a prescribed set count to display/multiply into sets.
  if (isAMRAPBlock(block)) return 1;
  return block.rounds || 1;
}

// Derives the block label and default interval-timer config (work/rest/rounds/
// exerciseCount) for a Tabata or EMOM-family block, given how many exercises
// are in it. Returns null for a block that isn't a timed rotating block.
export function deriveBlockTimerConfig(block, exerciseCount, blockExs = null) {
  if (block.block_type == null && block.workout_format == null) return null;
  const count = Math.max(1, exerciseCount || 1);

  if (isTabataBlock(block)) {
    return {
      blockLabel: 'Tabata',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: false,
      timerDefaultConfig: {
        workSec: block.work_seconds ?? 20,
        restSec: block.rest_seconds ?? 10,
        rounds: block.rounds ?? 1,
      },
    };
  }

  if (isSupersetBlock(block)) {
    const ladder = isLadderBlock(blockExs);
    return {
      blockLabel: ladder ? 'Ladder' : 'Superset',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: true,
      isLadder: ladder,
      timerDefaultConfig: {
        rounds: ladder ? getLadderRounds(blockExs) : (block.rounds ?? 1),
        restSec: block.rest_seconds ?? 90,
      },
    };
  }

  // AMRAP: a single countdown against the block's time cap, no round
  // advancing — the athlete decides for themselves when to loop back to the
  // first exercise. `rounds`, when present, is only a coach-set target, not
  // a count the timer should enforce, so it's ignored here.
  if (isAMRAPBlock(block)) {
    return {
      blockLabel: 'AMRAP',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: false,
      isAmrap: true,
      timerDefaultConfig: {
        workSec: block.time_cap_sec || 0,
        restSec: 0,
        rounds: 1,
      },
    };
  }

  // A ladder circuit (e.g. Bellzebub's "20-1" KB swing/goblet squat pair)
  // rotates through its exercises once per rung even though block.rounds
  // itself is never set — the ladder's own length is what makes it rotate.
  if (isCircuitBlock(block) && (isRotatingCircuitBlock(block) || isLadderBlock(blockExs))) {
    const ladder = isLadderBlock(blockExs);
    return {
      blockLabel: ladder ? 'Ladder' : 'Circuit',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: true,
      isLadder: ladder,
      timerDefaultConfig: {
        rounds: ladder ? getLadderRounds(blockExs) : (block.rounds ?? 1),
        restSec: block.rest_seconds ?? 0,
      },
    };
  }

  if (isEMOMBlock(block)) {
    // EMOM is "every N minutes" generalized: the interval length is the block's
    // total time cap divided by its round count (defaulting to a classic 60s
    // minute when time_cap_sec isn't set). Any EMOM with more than one
    // exercise rotates a single exercise per round — the classic "minute 1:
    // A, minute 2: B, minute 3: C, repeat" pattern — same as an explicitly
    // tagged "alternating" EMOM; a single-exercise block just has one round
    // per turn. The stored "rounds" is the total number of individual turns
    // (e.g. "EMOM x 15" cycling 3 exercises = 15 turns = 5 cycles), not
    // cycles through the whole group — divide it back down since the timer
    // engine multiplies rounds × exerciseCount itself.
    const rotates = isAlternatingEmomBlock(block) || count > 1;
    const rawRounds = block.rounds ?? 1;
    const intervalSec = block.time_cap_sec ? Math.round(block.time_cap_sec / rawRounds) : 60;
    const blockLabel = (intervalSec > 0 && intervalSec % 60 === 0 && intervalSec !== 60)
      ? `E${intervalSec / 60}MOM`
      : 'EMOM';
    const groupRounds = rotates
      ? Math.max(1, Math.round(rawRounds / count))
      : rawRounds;
    return {
      blockLabel,
      isEmomFamily: true,
      isAlternatingEmom: rotates,
      timerDefaultConfig: { workSec: intervalSec, restSec: 0, rounds: groupRounds },
    };
  }

  return null;
}