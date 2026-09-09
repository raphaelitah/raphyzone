import { describe, it, expect } from 'vitest';
import {
  isEMOMBlock,
  isAlternatingEmomBlock,
  isTabataBlock,
  getEMOMMinutes,
  getEffectiveRounds,
  deriveBlockTimerConfig,
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  buildSetsByBlockExercise,
  buildExerciseMapByCode,
  countWorkoutExercises,
  countWorkoutRests,
  buildFlatExerciseList,
  getWorkoutMetaLine,
  roundToFive,
  getLadderSequence,
  isLadderBlock,
  getLadderRounds,
  getLadderRepsForRound,
} from './workoutStructure';

describe('isEMOMBlock / isAlternatingEmomBlock / isTabataBlock', () => {
  it('matches on block_type or workout_format, case-insensitively', () => {
    expect(isEMOMBlock({ block_type: 'EMOM' })).toBe(true);
    expect(isEMOMBlock({ workout_format: 'emom' })).toBe(true);
    expect(isEMOMBlock({ block_type: 'emom_alternating' })).toBe(true);
    expect(isEMOMBlock({ block_type: 'superset' })).toBe(false);

    expect(isAlternatingEmomBlock({ block_type: 'emom_alternating' })).toBe(true);
    expect(isAlternatingEmomBlock({ workout_format: 'EMOM_Alternating' })).toBe(true);
    expect(isAlternatingEmomBlock({ block_type: 'emom' })).toBe(false);

    expect(isTabataBlock({ block_type: 'Tabata' })).toBe(true);
    expect(isTabataBlock({ block_type: 'emom' })).toBe(false);
  });
});

describe('getEMOMMinutes', () => {
  it('rounds time_cap_sec to whole minutes', () => {
    expect(getEMOMMinutes({ time_cap_sec: 540 })).toBe(9);
    expect(getEMOMMinutes({ time_cap_sec: 0 })).toBe(0);
    expect(getEMOMMinutes({})).toBe(0);
  });
});

describe('getEffectiveRounds', () => {
  it('divides EMOM minutes by exercise count', () => {
    const block = { block_type: 'emom', time_cap_sec: 540 };
    expect(getEffectiveRounds(block, 3)).toBe(3);
  });

  it('falls back to block.rounds for non-EMOM blocks', () => {
    expect(getEffectiveRounds({ block_type: 'superset', rounds: 4 }, 2)).toBe(4);
    expect(getEffectiveRounds({ block_type: 'superset' }, 2)).toBe(1);
  });

  it('falls back to block.rounds when exerciseCount is 0', () => {
    expect(getEffectiveRounds({ block_type: 'emom', time_cap_sec: 540, rounds: 5 }, 0)).toBe(5);
  });
});

describe('deriveBlockTimerConfig', () => {
  it('returns null for a block with no type/format info', () => {
    expect(deriveBlockTimerConfig({}, 3)).toBeNull();
  });

  it('returns null for a plain (non-timed) block', () => {
    expect(deriveBlockTimerConfig({ block_type: 'straight_sets' }, 3)).toBeNull();
  });

  it('builds a Tabata config from the block fields', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'tabata', work_seconds: 20, rest_seconds: 10, rounds: 8 },
      1
    );
    expect(result).toEqual({
      blockLabel: 'Tabata',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: false,
      timerDefaultConfig: { workSec: 20, restSec: 10, rounds: 8 },
    });
  });

  it('defaults Tabata work/rest/rounds when unset', () => {
    const result = deriveBlockTimerConfig({ block_type: 'tabata' }, 1);
    expect(result.timerDefaultConfig).toEqual({ workSec: 20, restSec: 10, rounds: 1 });
  });

  it('labels a classic 60s-interval EMOM as "EMOM"', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom', time_cap_sec: 300, rounds: 5 },
      2
    );
    expect(result.blockLabel).toBe('EMOM');
    expect(result.isEmomFamily).toBe(true);
    // A multi-exercise EMOM rotates one exercise per round even without the
    // explicit "emom_alternating" tag, so the stored rounds (turns) get
    // divided back down to group cycles for the timer engine.
    expect(result.isAlternatingEmom).toBe(true);
    expect(result.timerDefaultConfig).toEqual({ workSec: 60, restSec: 0, rounds: 3 });
  });

  it('labels a non-60s interval as "E<n>MOM"', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom', time_cap_sec: 540, rounds: 3 },
      1
    );
    expect(result.blockLabel).toBe('E3MOM');
    expect(result.timerDefaultConfig.workSec).toBe(180);
  });

  it('divides an alternating EMOM turn count down by exercise count (regression for 5337c32)', () => {
    // "Alternating EMOM x9" cycling 3 exercises: rounds=9 turns total, 3 turns
    // through the group of 3 — must NOT be passed straight through, since the
    // timer multiplies rounds x exerciseCount itself (previously produced 27).
    const result = deriveBlockTimerConfig(
      { block_type: 'emom_alternating', time_cap_sec: 540, rounds: 9 },
      3
    );
    expect(result.isAlternatingEmom).toBe(true);
    expect(result.timerDefaultConfig.rounds).toBe(3);
  });

  it('floors the exercise count at 1 to avoid divide-by-zero', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom_alternating', time_cap_sec: 300, rounds: 5 },
      0
    );
    expect(result.timerDefaultConfig.rounds).toBe(5);
  });

  it('never rounds an alternating EMOM down to 0 rounds', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom_alternating', time_cap_sec: 60, rounds: 1 },
      4
    );
    expect(result.timerDefaultConfig.rounds).toBe(1);
  });

  it('defaults the EMOM interval to 60s when time_cap_sec is unset', () => {
    const result = deriveBlockTimerConfig({ block_type: 'emom', rounds: 1 }, 1);
    expect(result.timerDefaultConfig.workSec).toBe(60);
  });
});

describe('buildBlocksByWorkout / buildBlockExercisesByBlock / buildSetsByBlockExercise', () => {
  it('groups by parent id and sorts by order field', () => {
    const blocks = [
      { block_id: 'b2', workout_id: 'w1', order_index: 2 },
      { block_id: 'b1', workout_id: 'w1', order_index: 1 },
      { block_id: 'b3', workout_id: 'w2', order_index: 1 },
    ];
    const map = buildBlocksByWorkout(blocks);
    expect(map.w1.map((b) => b.block_id)).toEqual(['b1', 'b2']);
    expect(map.w2.map((b) => b.block_id)).toEqual(['b3']);
  });

  it('treats a missing order_index as 0', () => {
    const blocks = [
      { block_id: 'b2', workout_id: 'w1', order_index: 1 },
      { block_id: 'b1', workout_id: 'w1' },
    ];
    const map = buildBlocksByWorkout(blocks);
    expect(map.w1.map((b) => b.block_id)).toEqual(['b1', 'b2']);
  });

  it('groups block exercises by block_id, sorted by order_in_block', () => {
    const blockExs = [
      { block_exercise_id: 'e2', block_id: 'b1', order_in_block: 2 },
      { block_exercise_id: 'e1', block_id: 'b1', order_in_block: 1 },
    ];
    const map = buildBlockExercisesByBlock(blockExs);
    expect(map.b1.map((e) => e.block_exercise_id)).toEqual(['e1', 'e2']);
  });

  it('groups prescribed sets by block_exercise_id, sorted by set_number', () => {
    const sets = [
      { block_exercise_id: 'e1', set_number: 2 },
      { block_exercise_id: 'e1', set_number: 1 },
    ];
    const map = buildSetsByBlockExercise(sets);
    expect(map.e1.map((s) => s.set_number)).toEqual([1, 2]);
  });
});

describe('buildExerciseMapByCode', () => {
  it('keys exercises by exercise_code, skipping ones without a code', () => {
    const exercises = [
      { exercise_code: 'PUSHUP', name: 'Push-up' },
      { name: 'No code' },
    ];
    const map = buildExerciseMapByCode(exercises);
    expect(map).toEqual({ PUSHUP: { exercise_code: 'PUSHUP', name: 'Push-up' } });
  });
});

describe('countWorkoutExercises / countWorkoutRests', () => {
  const blocksByWorkout = { w1: [{ block_id: 'b1' }, { block_id: 'b2' }] };
  const blockExercisesByBlock = {
    b1: [{ step_type: 'exercise' }, { step_type: 'rest' }],
    b2: [{ step_type: 'exercise' }],
  };

  it('counts only exercise steps across all of a workout\'s blocks', () => {
    expect(countWorkoutExercises({ workout_id: 'w1' }, blocksByWorkout, blockExercisesByBlock)).toBe(2);
  });

  it('counts only rest steps across all of a workout\'s blocks', () => {
    expect(countWorkoutRests({ workout_id: 'w1' }, blocksByWorkout, blockExercisesByBlock)).toBe(1);
  });

  it('returns 0 for a workout with no blocks', () => {
    expect(countWorkoutExercises({ workout_id: 'missing' }, blocksByWorkout, blockExercisesByBlock)).toBe(0);
  });
});

describe('buildFlatExerciseList', () => {
  const workout = { workout_id: 'w1' };
  const blocksByWorkout = {
    w1: [{ block_id: 'b1', block_type: 'emom', time_cap_sec: 540, rounds: 9 }],
  };
  const blockExercisesByBlock = {
    b1: [
      { block_exercise_id: 'e1', block_id: 'b1', step_type: 'exercise', exercise_id: 'ex1', prescription_value: '12', load_value: '20' },
      { block_exercise_id: 'e2', block_id: 'b1', step_type: 'rest' },
      { block_exercise_id: 'e3', block_id: 'b1', step_type: 'exercise', exercise_id: 'ex2' },
    ],
  };
  const setsByBlockExercise = {
    e1: [{ target_reps: 12, set_number: 1 }, { target_reps: 12, set_number: 2 }],
  };
  const exerciseMap = { ex1: { name: 'Push-up' } };

  it('flattens only exercise steps, excluding rest steps', () => {
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.key)).toEqual(['e1', 'e3']);
  });

  it('derives sets/reps/weight from prescribed sets and block-exercise fields', () => {
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    const pushup = list.find((e) => e.key === 'e1');
    expect(pushup.exercise_name).toBe('Push-up');
    expect(pushup.sets).toBe(2);
    expect(pushup.reps).toBe('12');
    expect(pushup.target_weight).toBe(20);
  });

  it('falls back to exercise_title_raw and prescription_value when there is no exercise/set data', () => {
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    const noDetails = list.find((e) => e.key === 'e3');
    expect(noDetails.exercise_name).toBe('Exercise');
    expect(noDetails.sets).toBe(1);
  });

  it('prefers the per-step exercise_title_raw over the catalog name when both exist, so steps sharing one exercise_id (e.g. a progressive treadmill interval) stay distinguishable on screen', () => {
    const blockExercisesWithTitles = {
      b1: [
        { block_exercise_id: 'e1', block_id: 'b1', step_type: 'exercise', exercise_id: 'ex1', exercise_title_raw: 'Treadmill Run (10% incline)' },
        { block_exercise_id: 'e3', block_id: 'b1', step_type: 'exercise', exercise_id: 'ex1', exercise_title_raw: 'Treadmill Run (12% incline)' },
      ],
    };
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesWithTitles, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.exercise_name)).toEqual(['Treadmill Run (10% incline)', 'Treadmill Run (12% incline)']);
  });

  it('computes effective_sets as effective rounds x set count, using the EMOM exercise-count divisor', () => {
    // 2 exercises in this EMOM block, 9-minute cap -> getEffectiveRounds gives 4 (floor(9/2)).
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    const pushup = list.find((e) => e.key === 'e1');
    expect(pushup.rounds).toBe(4);
    expect(pushup.effective_sets).toBe(8); // 4 rounds x 2 sets
  });
});

describe('roundToFive', () => {
  it('rounds to the nearest multiple of 5', () => {
    expect(roundToFive(22)).toBe(20);
    expect(roundToFive(23)).toBe(25);
    expect(roundToFive(0)).toBe(0);
    expect(roundToFive(null)).toBe(0);
  });
});

describe('getWorkoutMetaLine', () => {
  it('joins exercise/rest/round counts, pluralizing correctly', () => {
    const workout = { workout_id: 'w1' };
    const blocksByWorkout = { w1: [{ block_id: 'b1' }] };
    const blockExercisesByBlock = {
      b1: [{ step_type: 'exercise' }, { step_type: 'exercise' }, { step_type: 'rest' }],
    };
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('2 Exercises · 1 Rest');
  });

  it('singularizes a single exercise with no rests', () => {
    const workout = { workout_id: 'w1' };
    const blocksByWorkout = { w1: [{ block_id: 'b1' }] };
    const blockExercisesByBlock = { b1: [{ step_type: 'exercise' }] };
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('1 Exercise');
  });

  it('appends a rounds count for an EMOM block, derived from rounds / (exercises + rests)', () => {
    const workout = { workout_id: 'w1' };
    const blocksByWorkout = { w1: [{ block_id: 'b1', block_type: 'emom', rounds: 9 }] };
    const blockExercisesByBlock = {
      b1: [{ step_type: 'exercise' }, { step_type: 'exercise' }, { step_type: 'exercise' }],
    };
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('3 Exercises · 3 Rounds');
  });

  it('derives EMOM rounds from the EMOM block\'s own exercise count, not the whole workout\'s', () => {
    const workout = { workout_id: 'w1' };
    const blocksByWorkout = { w1: [{ block_id: 'b1', block_type: 'emom', rounds: 9 }, { block_id: 'b2' }] };
    const blockExercisesByBlock = {
      b1: [{ step_type: 'exercise' }, { step_type: 'exercise' }, { step_type: 'exercise' }],
      b2: [{ step_type: 'exercise' }, { step_type: 'exercise' }],
    };
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('5 Exercises · 3 Rounds');
  });
});

describe('Ladder blocks (Ben\'s Therapy: 10-9-8...-1 devil\'s press paired with a 20-18-16...-2 squat ladder)', () => {
  const devilsPress = { block_exercise_id: 'be1', block_id: 'b1', ladder_start_reps: 10, ladder_end_reps: 1, ladder_step: 1 };
  const dbSquat = { block_exercise_id: 'be2', block_id: 'b1', ladder_start_reps: 20, ladder_end_reps: 2, ladder_step: 2 };

  it('builds a descending rep sequence from start/end/step', () => {
    expect(getLadderSequence(devilsPress)).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(getLadderSequence(dbSquat)).toEqual([20, 18, 16, 14, 12, 10, 8, 6, 4, 2]);
  });

  it('returns null for a non-ladder exercise', () => {
    expect(getLadderSequence({})).toBeNull();
    expect(getLadderSequence({ ladder_start_reps: 10 })).toBeNull();
    expect(getLadderSequence({ ladder_start_reps: 5, ladder_end_reps: 5 })).toBeNull();
  });

  it('detects a ladder block and reports its round count from the longest sequence', () => {
    expect(isLadderBlock([devilsPress, dbSquat])).toBe(true);
    expect(isLadderBlock([{ block_exercise_id: 'be3' }])).toBe(false);
    expect(getLadderRounds([devilsPress, dbSquat])).toBe(10);
  });

  it('looks up the reps due on a given round, clamping past the last rung', () => {
    expect(getLadderRepsForRound(devilsPress, 1)).toBe(10);
    expect(getLadderRepsForRound(devilsPress, 5)).toBe(6);
    expect(getLadderRepsForRound(devilsPress, 10)).toBe(1);
    expect(getLadderRepsForRound(devilsPress, 99)).toBe(1);
    expect(getLadderRepsForRound(dbSquat, 3)).toBe(16);
  });

  it('getEffectiveRounds prefers the ladder round count over block.rounds', () => {
    const block = { block_type: 'superset', workout_format: 'for_time', rounds: null };
    expect(getEffectiveRounds(block, 2, [devilsPress, dbSquat])).toBe(10);
  });

  it('deriveBlockTimerConfig labels a ladder superset and sizes rounds off the ladder', () => {
    const block = { block_type: 'superset', workout_format: 'for_time', rounds: null, rest_seconds: 60 };
    const config = deriveBlockTimerConfig(block, 2, [devilsPress, dbSquat]);
    expect(config).toMatchObject({
      blockLabel: 'Ladder',
      isSuperset: true,
      isLadder: true,
      timerDefaultConfig: { rounds: 10, restSec: 60 },
    });
  });

  it('buildFlatExerciseList surfaces the joined rep sequence and a round-aware ladder array per exercise', () => {
    const workout = { workout_id: 'w1' };
    const blocksByWorkout = { w1: [{ block_id: 'b1', workout_id: 'w1', block_type: 'superset', workout_format: 'for_time' }] };
    const blockExercisesByBlock = {
      b1: [
        { ...devilsPress, order_in_block: 1, step_type: 'exercise', exercise_title_raw: "Dumbbell Devil Press" },
        { ...dbSquat, order_in_block: 2, step_type: 'exercise', exercise_title_raw: 'Dumbbell Squat Clean' },
      ],
    };
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, {}, {});
    expect(list.map((e) => e.reps)).toEqual(['10-9-8-7-6-5-4-3-2-1', '20-18-16-14-12-10-8-6-4-2']);
    expect(list.map((e) => e.rounds)).toEqual([10, 10]);
    expect(list[0].ladder).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
  });
});
