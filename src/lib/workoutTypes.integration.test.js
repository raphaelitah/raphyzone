// Integration coverage for each workout "type" the app supports (Tabata, EMOM,
// standalone, circuit, AMRAP) plus real workouts from the catalog: 2007 (a
// pure circuit) and 1775 (a pure AMRAP), and three combination workouts —
// 40-20 Workout (multi-superset/interval), Balthazar (superset + standalone),
// and 50x Workout (circuit + standalone). Exercises the full pipeline of
// workoutStructure.js helpers the way WorkoutExecution/WorkoutTimerPanel do:
// buildBlocksByWorkout -> buildBlockExercisesByBlock -> buildSetsByBlockExercise
// -> buildFlatExerciseList / deriveBlockTimerConfig / getWorkoutMetaLine.
import { describe, it, expect } from 'vitest';
import {
  buildBlocksByWorkout,
  buildBlockExercisesByBlock,
  buildSetsByBlockExercise,
  buildExerciseMapByCode,
  buildFlatExerciseList,
  deriveBlockTimerConfig,
  getWorkoutMetaLine,
  getEffectiveRounds,
} from './workoutStructure';

function buildWorkoutFixture({ workout, blocks, blockExercises, sets = [], exercises = [] }) {
  return {
    workout,
    blocksByWorkout: buildBlocksByWorkout(blocks),
    blockExercisesByBlock: buildBlockExercisesByBlock(blockExercises),
    setsByBlockExercise: buildSetsByBlockExercise(sets),
    exerciseMap: buildExerciseMapByCode(exercises),
  };
}

describe('Tabata workout', () => {
  const workout = { workout_id: 'w-tabata' };
  const blocks = [
    { block_id: 'b1', workout_id: 'w-tabata', order_index: 1, block_type: 'tabata', work_seconds: 20, rest_seconds: 10, rounds: 8 },
  ];
  const blockExercises = [
    { block_exercise_id: 'be1', block_id: 'b1', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00432', exercise_title_raw: 'Burpee' },
  ];

  it('derives the classic 20/10 x8 Tabata interval config', () => {
    const config = deriveBlockTimerConfig(blocks[0], 1);
    expect(config).toEqual({
      blockLabel: 'Tabata',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: false,
      timerDefaultConfig: { workSec: 20, restSec: 10, rounds: 8 },
    });
  });

  it('flattens the single exercise with 8 effective rounds', () => {
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ exercise_name: 'Burpee', rounds: 8, effective_sets: 8 });
  });

  it('summarizes as a single exercise', () => {
    const { blocksByWorkout, blockExercisesByBlock } = buildWorkoutFixture({ workout, blocks, blockExercises });
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('1 Exercise');
  });
});

describe('EMOM workout (rotating exercises)', () => {
  const workout = { workout_id: 'w-emom' };
  // "EMOM 12" cycling 3 exercises: 12 total turns / 3 exercises = 4 cycles each.
  const blocks = [
    { block_id: 'b1', workout_id: 'w-emom', order_index: 1, block_type: 'emom', workout_format: 'EMOM', time_cap_sec: 720, rounds: 12 },
  ];
  const blockExercises = [
    { block_exercise_id: 'be1', block_id: 'b1', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00432', exercise_title_raw: 'Burpee' },
    { block_exercise_id: 'be2', block_id: 'b1', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX01858', exercise_title_raw: 'Reverse Lunge' },
    { block_exercise_id: 'be3', block_id: 'b1', order_in_block: 3, step_type: 'exercise', exercise_id: 'EX01214', exercise_title_raw: 'Hollow Rock' },
  ];

  it('derives a 60s-interval EMOM config rotating one exercise per minute', () => {
    const config = deriveBlockTimerConfig(blocks[0], 3);
    expect(config.blockLabel).toBe('EMOM');
    expect(config.isEmomFamily).toBe(true);
    expect(config.isAlternatingEmom).toBe(true);
    expect(config.timerDefaultConfig).toEqual({ workSec: 60, restSec: 0, rounds: 4 });
  });

  it('gives every exercise 4 effective rounds (floor(12min / 3 exercises))', () => {
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.rounds)).toEqual([4, 4, 4]);
  });

  it('summarizes with a rounds count', () => {
    const { blocksByWorkout, blockExercisesByBlock } = buildWorkoutFixture({ workout, blocks, blockExercises });
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('3 Exercises · 4 Rounds');
  });
});

describe('Standalone workout (sequential straight sets)', () => {
  const workout = { workout_id: 'w-standalone' };
  const blocks = [
    { block_id: 'b1', workout_id: 'w-standalone', order_index: 1, block_type: 'standalone', workout_format: 'strength_sets', rounds: 5, rest_between_rounds_sec: 120 },
  ];
  const blockExercises = [
    { block_exercise_id: 'be1', block_id: 'b1', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00589', exercise_title_raw: 'Crunch', prescription_value: '20' },
  ];

  it('is not treated as a rotating/interval timer block', () => {
    expect(deriveBlockTimerConfig(blocks[0], 1)).toBeNull();
  });

  it('takes its round count straight from block.rounds', () => {
    expect(getEffectiveRounds(blocks[0], 1)).toBe(5);
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list[0]).toMatchObject({ exercise_name: 'Crunch', rounds: 5, effective_sets: 5, rest_seconds: 120 });
  });
});

describe('"2007" (Circuit workout: row + pull-ups + push jerk, for time)', () => {
  const workout = { workout_id: 'a5f24c7e4cceee4193f8f4f6', name: '2007' };
  const blocks = [
    { block_id: 'BLK00384', workout_id: workout.workout_id, order_index: 1, block_label: 'A', block_type: 'circuit', workout_format: 'for_time' },
  ];
  const blockExercises = [
    { block_exercise_id: 'BE00972', block_id: 'BLK00384', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX01910', exercise_title_raw: 'Row', prescription_type: 'distance', prescription_value: '1,000m', notes: 'For Time' },
    { block_exercise_id: 'BE00973', block_id: 'BLK00384', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX02554', exercise_title_raw: 'Strict Pronated Pull-up', prescription_type: 'reps', prescription_value: '25', notes: 'Then, 5 rounds of' },
    { block_exercise_id: 'BE00974', block_id: 'BLK00384', order_in_block: 3, step_type: 'exercise', exercise_id: 'EX01802', exercise_title_raw: 'Push Jerk', prescription_type: 'reps', prescription_value: '7', notes: 'Then, 5 rounds of - 135/85 lb' },
  ];

  it('is not treated as a rotating/interval timer block (for-time, paced by the athlete)', () => {
    expect(deriveBlockTimerConfig(blocks[0], 3)).toBeNull();
  });

  it('flattens the 3 exercises in order, each defaulting to a single round (no block.rounds set)', () => {
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.exercise_name)).toEqual(['Row', 'Strict Pronated Pull-up', 'Push Jerk']);
    expect(list.map((e) => e.reps)).toEqual(['1,000m', '25', '7']);
    expect(list.every((e) => e.rounds === 1)).toBe(true);
  });

  it('summarizes with all 3 exercises', () => {
    const { blocksByWorkout, blockExercisesByBlock } = buildWorkoutFixture({ workout, blocks, blockExercises });
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('3 Exercises');
  });
});

describe('"1775" (AMRAP workout: self-paced, 60-minute time cap)', () => {
  const workout = { workout_id: '264f33ca51aef9c2a9f66d13', name: '1775' };
  const blocks = [
    { block_id: 'BLK00345', workout_id: workout.workout_id, order_index: 1, block_label: 'A', block_type: 'superset', workout_format: 'amrap', time_cap_sec: 3600 },
  ];
  const blockExercises = [
    { block_exercise_id: 'BE00812', block_id: 'BLK00345', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00796', exercise_title_raw: 'Dumbbell Power Clean', prescription_type: 'reps', prescription_value: '17', notes: 'AMRAP in 60 minutes - 135/95 lb' },
    { block_exercise_id: 'BE00813', block_id: 'BLK00345', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX00059', exercise_title_raw: 'Air Squat', prescription_type: 'reps', prescription_value: '75', notes: 'AMRAP in 60 minutes' },
  ];

  it('derives a Superset timer config, defaulting to 1 round since no block.rounds is set', () => {
    expect(deriveBlockTimerConfig(blocks[0], 2)).toEqual({
      blockLabel: 'Superset',
      isEmomFamily: false,
      isAlternatingEmom: false,
      isSuperset: true,
      timerDefaultConfig: { rounds: 1, restSec: 90 },
    });
  });

  it('has no fixed round count, so exercises default to a single pass through the couplet', () => {
    expect(getEffectiveRounds(blocks[0], 2)).toBe(1);
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.exercise_name)).toEqual(['Dumbbell Power Clean', 'Air Squat']);
    expect(list.map((e) => e.rounds)).toEqual([1, 1]);
    expect(list.map((e) => e.time_cap_sec)).toEqual([3600, 3600]);
  });
});

describe('"40-20 Workout" (combination: 3 supersets, interval work/rest embedded per set)', () => {
  const workout = { workout_id: '6a8b5ff82f65fc56923ecc7d', title: '40-20 Workout' };
  const blocks = [
    { block_id: 'BLK00003', workout_id: workout.workout_id, order_index: 1, block_label: 'A', block_type: 'superset', workout_format: 'superset', rounds: 4, rest_seconds: 180 },
    { block_id: 'BLK00004', workout_id: workout.workout_id, order_index: 2, block_label: 'B', block_type: 'superset', workout_format: 'superset', rounds: 4, rest_seconds: 180 },
    { block_id: 'BLK00005', workout_id: workout.workout_id, order_index: 3, block_label: 'C', block_type: 'superset', workout_format: 'superset', rounds: 4, rest_seconds: 180 },
  ];
  const blockExercises = [
    { block_exercise_id: 'BE00012', block_id: 'BLK00003', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX01287', exercise_title_raw: 'Jump Squat', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00013', block_id: 'BLK00003', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX01709', exercise_title_raw: 'Plank Walk-Up', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00014', block_id: 'BLK00003', order_in_block: 3, step_type: 'exercise', exercise_id: 'EX00455', exercise_title_raw: 'Butterfly Sit-Up', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00015', block_id: 'BLK00004', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX02788', exercise_title_raw: 'Wall Sit', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00016', block_id: 'BLK00004', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX01803', exercise_title_raw: 'Push-Up', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00017', block_id: 'BLK00004', order_in_block: 3, step_type: 'exercise', exercise_id: 'EX02870', exercise_title_raw: 'Hollow Body Wall Walk', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00018', block_id: 'BLK00005', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00432', exercise_title_raw: 'Burpee', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00019', block_id: 'BLK00005', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX02769', exercise_title_raw: 'V-Up', prescription_value: '40 on, 20 off' },
    { block_exercise_id: 'BE00020', block_id: 'BLK00005', order_in_block: 3, step_type: 'exercise', exercise_id: 'EX00421', exercise_title_raw: 'Box Step-Up', prescription_value: '40 on, 20 off' },
  ];

  it('derives a Superset timer config (4 rounds, 3-min rest) for every block', () => {
    blocks.forEach((block) => {
      const config = deriveBlockTimerConfig(block, 3);
      expect(config).toEqual({
        blockLabel: 'Superset',
        isEmomFamily: false,
        isAlternatingEmom: false,
        isSuperset: true,
        timerDefaultConfig: { rounds: 4, restSec: 180 },
      });
    });
  });

  it('flattens all 9 exercises across the 3 supersets in order, each with 4 rounds', () => {
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.exercise_name)).toEqual([
      'Jump Squat', 'Plank Walk-Up', 'Butterfly Sit-Up',
      'Wall Sit', 'Push-Up', 'Hollow Body Wall Walk',
      'Burpee', 'V-Up', 'Box Step-Up',
    ]);
    expect(list.every((e) => e.rounds === 4)).toBe(true);
    expect(list.every((e) => e.reps === '40 on, 20 off')).toBe(true);
  });

  it('summarizes with all 9 exercises', () => {
    const { blocksByWorkout, blockExercisesByBlock } = buildWorkoutFixture({ workout, blocks, blockExercises });
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('9 Exercises');
  });
});

describe('"Balthazar" (combination: 2 supersets + 2 standalone strength blocks)', () => {
  const workout = { workout_id: '6a8b5ff82f65fc56923ecc99', title: 'Balthazar' };
  const blocks = [
    { block_id: 'BLK00090', workout_id: workout.workout_id, order_index: 1, block_label: 'A', block_type: 'superset', workout_format: 'superset', rounds: 5, rest_seconds: 90 },
    { block_id: 'BLK00091', workout_id: workout.workout_id, order_index: 2, block_label: 'B', block_type: 'superset', workout_format: 'superset', rounds: 4, rest_seconds: 90 },
    { block_id: 'BLK00092', workout_id: workout.workout_id, order_index: 3, block_label: 'C', block_type: 'standalone', workout_format: 'strength_sets', rounds: 3, rest_between_rounds_sec: 120 },
    { block_id: 'BLK00093', workout_id: workout.workout_id, order_index: 4, block_label: 'D', block_type: 'standalone', workout_format: 'strength_sets', rounds: 5, rest_between_rounds_sec: 120 },
  ];
  const blockExercises = [
    { block_exercise_id: 'BE00175', block_id: 'BLK00090', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00724', exercise_title_raw: 'Dumbbell Bench Press', prescription_value: '8' },
    { block_exercise_id: 'BE00176', block_id: 'BLK00090', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX00165', exercise_title_raw: 'Band Pull Apart', prescription_value: '15' },
    { block_exercise_id: 'BE00177', block_id: 'BLK00091', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00854', exercise_title_raw: 'Dumbbell Push Press', prescription_value: '10' },
    { block_exercise_id: 'BE00178', block_id: 'BLK00091', order_in_block: 2, step_type: 'exercise', exercise_id: 'EX02129', exercise_title_raw: 'Single Arm Dumbbell Bent Over Row', prescription_value: '15' },
    { block_exercise_id: 'BE00179', block_id: 'BLK00092', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX02098', exercise_title_raw: 'Single Arm Banded Seated Chest Fly', prescription_value: '12' },
    { block_exercise_id: 'BE00180', block_id: 'BLK00093', order_in_block: 1, step_type: 'exercise', exercise_id: 'EX00589', exercise_title_raw: 'Crunch', prescription_value: '20' },
  ];

  it('gives the two superset blocks a Superset timer config and the two standalone blocks none', () => {
    expect(deriveBlockTimerConfig(blocks[0], 2)).toMatchObject({ blockLabel: 'Superset', timerDefaultConfig: { rounds: 5, restSec: 90 } });
    expect(deriveBlockTimerConfig(blocks[1], 2)).toMatchObject({ blockLabel: 'Superset', timerDefaultConfig: { rounds: 4, restSec: 90 } });
    expect(deriveBlockTimerConfig(blocks[2], 1)).toBeNull();
    expect(deriveBlockTimerConfig(blocks[3], 1)).toBeNull();
  });

  it('flattens all 6 exercises in block order, each carrying its own block round count', () => {
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list.map((e) => e.exercise_name)).toEqual([
      'Dumbbell Bench Press', 'Band Pull Apart',
      'Dumbbell Push Press', 'Single Arm Dumbbell Bent Over Row',
      'Single Arm Banded Seated Chest Fly',
      'Crunch',
    ]);
    expect(list.map((e) => e.rounds)).toEqual([5, 5, 4, 4, 3, 5]);
  });
});

describe('"50x Workout" (combination: 10-exercise circuit + standalone finisher)', () => {
  const workout = { workout_id: '6a8b5ff82f65fc56923ecc7c', title: '50x Workout' };
  const blocks = [
    { block_id: 'BLK00001', workout_id: workout.workout_id, order_index: 1, block_label: 'A', block_type: 'circuit', workout_format: 'for_time' },
    { block_id: 'BLK00002', workout_id: workout.workout_id, order_index: 2, block_label: 'B', block_type: 'standalone', workout_format: 'strength_sets' },
  ];
  const circuitExerciseNames = [
    'Reverse Lunge', 'Glute Bridge', 'Butterfly Sit-Up', 'Bench Dip', 'Burpee',
    'Bench Dip', 'Butterfly Sit-Up', 'Glute Bridge', 'Reverse Lunge', 'Pike Handstand Push-Up',
  ];
  const blockExercises = [
    ...circuitExerciseNames.map((name, i) => ({
      block_exercise_id: `BE0000${i + 1}`,
      block_id: 'BLK00001',
      order_in_block: i + 1,
      step_type: 'exercise',
      exercise_title_raw: name,
      prescription_value: '50',
    })),
    { block_exercise_id: 'BE00011', block_id: 'BLK00002', order_in_block: 1, step_type: 'exercise', exercise_title_raw: 'Hollow Rock', prescription_value: '100', notes: 'Every time you break - 15 sit ups' },
  ];

  it('has no rotating timer config for either the circuit or the standalone block (both rep-based, no fixed rounds)', () => {
    expect(deriveBlockTimerConfig(blocks[0], 10)).toBeNull();
    expect(deriveBlockTimerConfig(blocks[1], 1)).toBeNull();
  });

  it('flattens the 10-exercise circuit followed by the standalone finisher, each defaulting to 1 round', () => {
    const { blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap } =
      buildWorkoutFixture({ workout, blocks, blockExercises });
    const list = buildFlatExerciseList(workout, blocksByWorkout, blockExercisesByBlock, setsByBlockExercise, exerciseMap);
    expect(list).toHaveLength(11);
    expect(list.slice(0, 10).map((e) => e.exercise_name)).toEqual(circuitExerciseNames);
    expect(list[10]).toMatchObject({ exercise_name: 'Hollow Rock', reps: '100', coach_note: 'Every time you break - 15 sit ups' });
    expect(list.every((e) => e.rounds === 1)).toBe(true);
  });

  it('summarizes with all 11 exercises', () => {
    const { blocksByWorkout, blockExercisesByBlock } = buildWorkoutFixture({ workout, blocks, blockExercises });
    expect(getWorkoutMetaLine(workout, blocksByWorkout, blockExercisesByBlock)).toBe('11 Exercises');
  });
});
