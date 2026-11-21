import { describe, it, expect } from 'vitest';
import { groupSessionsByBlock, wasWorkedOn } from './sessionGrouping';

// Shaped like a real session: four standalone blocks (A-D), three exercises added
// mid-session (bench and incline after A, plank after D), only some results saved.
const blocks = ['A', 'B', 'C', 'D'].map((label, i) => ({ block_id: `BLK${i}`, block_label: label, order_index: i + 1 }));
const be = (id, block_id, exercise_id, title) => ({ block_exercise_id: id, block_id, step_type: 'exercise', exercise_id, exercise_title_raw: title, order_in_block: 1 });
const byBlock = {
  BLK0: [be('BE0', 'BLK0', 'EX_ROW', 'Bent Over Dumbbell Row')],
  BLK1: [be('BE1', 'BLK1', 'EX_INCROW', 'Chest Supported Incline DB Row')],
  BLK2: [be('BE2', 'BLK2', 'EX_CURL', 'EZ Bar Curl')],
  BLK3: [be('BE3', 'BLK3', 'EX_RDELT', 'Chest Supported Incline Rear Delt Raise')],
};
const added = [
  { key: 'added-a', exercise: { exercise_code: 'EX_BENCH', name: 'Barbell Bench Press' } },
  { key: 'added-b', exercise: { exercise_code: 'EX_INCBENCH', name: 'Incline Barbell Bench Press' } },
  { key: 'added-c', exercise: { exercise_code: 'EX_PLANK', name: 'Forearm Plank' } },
];
const sequence = ['BLK0', 'added:added-a', 'added:added-b', 'BLK1', 'BLK2', 'BLK3', 'added:added-c'];
// results saved for the row, the bench and the plank only
const sessions = [
  { id: 1, exercise_id: 'EX_ROW', exercise_name: 'Bent Over Dumbbell Row' },
  { id: 2, exercise_id: 'EX_BENCH', exercise_name: 'Barbell Bench Press' },
  { id: 3, exercise_id: 'EX_PLANK', exercise_name: 'Forearm Plank' },
];

describe('groupSessionsByBlock', () => {
  it('lists added exercises in the position they were run, not under "Other"', () => {
    const { groups, leftover } = groupSessionsByBlock(blocks, byBlock, sessions, added, sequence);
    expect(groups.map((g) => g.items[0].be.exercise_title_raw)).toEqual([
      'Bent Over Dumbbell Row',
      'Barbell Bench Press',
      'Incline Barbell Bench Press',
      'Chest Supported Incline DB Row',
      'EZ Bar Curl',
      'Chest Supported Incline Rear Delt Raise',
      'Forearm Plank',
    ]);
    expect(leftover).toEqual([]);
  });

  it('attaches saved results to the right slot and leaves unsaved ones empty', () => {
    const { groups } = groupSessionsByBlock(blocks, byBlock, sessions, added, sequence);
    expect(groups.map((g) => !!g.items[0].es)).toEqual([true, true, false, false, false, false, true]);
  });

  it('keeps the old behaviour (saved order, no additions) when nothing was added', () => {
    const { groups } = groupSessionsByBlock(blocks, byBlock, [sessions[0]]);
    expect(groups.map((g) => g.block.block_label)).toEqual(['A', 'B', 'C', 'D']);
  });

  it('puts groups missing from the order after the ones in it', () => {
    const { groups } = groupSessionsByBlock(blocks, byBlock, sessions, [], ['BLK2', 'BLK0']);
    expect(groups.map((g) => g.block.block_label)).toEqual(['C', 'A', 'B', 'D']);
  });
});

describe('wasWorkedOn', () => {
  const block = { block_id: 'BLK1' };
  const slot = { block_exercise_id: 'BE1' };
  it('is true when the saved progress shows the exercise was started, false for a real skip', () => {
    expect(wasWorkedOn({ BE1: { hasStartedBlock: true, round: 3 } }, block, slot)).toBe(true);
    expect(wasWorkedOn({ BLK1: { hasStartedBlock: true } }, block, slot)).toBe(true);
    expect(wasWorkedOn({ BE1: { hasStartedBlock: false, round: 1 } }, block, slot)).toBe(false);
    expect(wasWorkedOn({}, block, slot)).toBe(false);
    expect(wasWorkedOn(null, block, slot)).toBe(false);
  });
});
