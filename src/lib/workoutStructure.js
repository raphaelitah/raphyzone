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
      const reps = sets[0]?.target_reps?.toString() || be.prescription_value || '';
      const targetWeight = be.load_value ? parseFloat(be.load_value) : null;
      const details = exerciseMap[be.exercise_id] || null;
      const rounds = getEffectiveRounds(block, blockExs.length);
      list.push({
        exercise_id: be.exercise_id,
        exercise_name: details?.name || be.exercise_title_raw || 'Exercise',
        sets: setCount,
        rounds,
        effective_sets: rounds * setCount,
        reps,
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
  return type === 'emom' || format === 'emom';
}

export function getEMOMMinutes(block) {
  return block.time_cap_sec ? Math.round(block.time_cap_sec / 60) : 0;
}

export function isTabataBlock(block) {
  const type = (block.block_type || '').toLowerCase();
  const format = (block.workout_format || '').toLowerCase();
  return type === 'tabata' || format === 'tabata';
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
    const denominator = exerciseCount + restCount;
    if (denominator > 0) {
      const rounds = Math.round(emomBlock.rounds / denominator);
      parts.push(`${rounds} ${rounds === 1 ? 'Round' : 'Rounds'}`);
    }
  }
  return parts.join(' · ');
}

export function getEffectiveRounds(block, exerciseCount) {
  if (isEMOMBlock(block) && exerciseCount > 0) {
    const mins = getEMOMMinutes(block);
    if (mins > 0) return Math.floor(mins / exerciseCount);
  }
  return block.rounds || 1;
}