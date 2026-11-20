import { describe, it, expect } from 'vitest';
import {
  applyEditToExercise,
  insertAddedExercise,
  applyAddedExercises,
  stableKey,
  hasSessionOverrides,
  groupExercises,
  sequenceOf,
  moveUpcomingGroup,
  applySequence,
  isReordered,
  sessionOverridesFromProgress,
} from './sessionOverrides';

const ex = (key, block_id, order, extra = {}) => ({ key, block_id, order, exercise_name: key, ...extra });
const picked = { exercise_code: 'EX1', name: 'Plank' };

describe('applyEditToExercise', () => {
  it('turns a block-rounds exercise into plain sets x reps and drops ladder/cardio labels', () => {
    const edited = applyEditToExercise(
      ex('E1', 'B1', 0, { sets: 3, rounds: 4, effective_sets: 12, reps: '8', ladder: [1, 2, 3], reps_label: '6 cals' }),
      { sets: '5', reps: 10 }
    );
    expect(edited).toMatchObject({ sets: 5, rounds: 1, effective_sets: 5, reps: '10', ladder: null, reps_label: null });
  });

  it('is a no-op without an edit and clamps sets to at least 1', () => {
    const e = ex('E1', 'B1', 0);
    expect(applyEditToExercise(e, undefined)).toBe(e);
    expect(applyEditToExercise(e, { sets: 0, reps: 8 }).sets).toBe(1);
  });
});

describe('insertAddedExercise', () => {
  const base = [ex('E1', 'B1', 0), ex('E2', 'B2', 1), ex('E3', 'B2', 2), ex('E4', 'B3', 3)];

  it('inserts after the whole block of the anchor exercise, never splitting a superset', () => {
    const out = insertAddedExercise(base, { key: 'added-1', afterKey: 'E2', exercise: picked, sets: 3, reps: 30 });
    expect(out.map((e) => e.key)).toEqual(['E1', 'E2', 'E3', 'added-1', 'E4']);
  });

  it('gives the new exercise its own block, a fresh stable order, and a 3x30 prescription', () => {
    const out = insertAddedExercise(base, { key: 'added-1', afterKey: 'E4', exercise: picked, sets: 3, reps: 30 });
    const added = out[out.length - 1];
    expect(added).toMatchObject({ exercise_id: 'EX1', exercise_name: 'Plank', sets: 3, effective_sets: 3, reps: '30', order: 4, block_id: 'added:added-1', addedKey: 'added-1' });
  });

  it('appends to the end when the anchor no longer exists', () => {
    const out = insertAddedExercise(base, { key: 'added-1', afterKey: 'gone', exercise: picked, sets: 1, reps: 5 });
    expect(out[out.length - 1].key).toBe('added-1');
  });

  it('anchors on the original key of a swapped exercise', () => {
    const swapped = [ex('X-sub-0', 'B1', 0, { swapOrigin: 'E1' }), ex('E2', 'B2', 1)];
    expect(stableKey(swapped[0])).toBe('E1');
    const out = insertAddedExercise(swapped, { key: 'a', afterKey: 'E1', exercise: picked, sets: 1, reps: 5 });
    expect(out.map((e) => e.key)).toEqual(['X-sub-0', 'a', 'E2']);
  });
});

describe('applyAddedExercises', () => {
  it('replays several additions deterministically, including one added after another addition', () => {
    const base = [ex('E1', 'B1', 0), ex('E2', 'B2', 1)];
    const added = [
      { key: 'a', afterKey: 'E1', exercise: picked, sets: 3, reps: 10 },
      { key: 'b', afterKey: 'a', exercise: { exercise_code: 'EX2', name: 'Curl' }, sets: 2, reps: 12 },
    ];
    const out = applyAddedExercises(base, added);
    expect(out.map((e) => [e.key, e.order])).toEqual([['E1', 0], ['a', 2], ['b', 3], ['E2', 1]]);
    // Replaying on reload gives the same result.
    expect(applyAddedExercises(base, added)).toEqual(out);
  });
});

describe('hasSessionOverrides', () => {
  it('is true for any swap, edit or addition', () => {
    expect(hasSessionOverrides({})).toBe(false);
    expect(hasSessionOverrides({ swaps: { E1: {} } })).toBe(true);
    expect(hasSessionOverrides({ edits: { E1: {} } })).toBe(true);
    expect(hasSessionOverrides({ added: [{}] })).toBe(true);
  });
});

describe('order helpers', () => {
  // B2 is a two-exercise block (a superset) that must move as one unit.
  const list = [ex('E1', 'B1', 0), ex('E2', 'B2', 1), ex('E3', 'B2', 2), ex('E4', 'B3', 3), ex('E5', 'B4', 4)];

  it('groups consecutive exercises of a block', () => {
    expect(groupExercises(list).map((g) => [g.id, g.exercises.length])).toEqual([['B1', 1], ['B2', 2], ['B3', 1], ['B4', 1]]);
    expect(sequenceOf(list)).toEqual(['B1', 'B2', 'B3', 'B4']);
  });

  it('moves a whole upcoming group, keeping a superset together', () => {
    const out = moveUpcomingGroup(list, 0, 'B3', 'up');
    expect(out.map((e) => e.key)).toEqual(['E1', 'E4', 'E2', 'E3', 'E5']);
    const down = moveUpcomingGroup(list, 0, 'B2', 'down');
    expect(down.map((e) => e.key)).toEqual(['E1', 'E4', 'E2', 'E3', 'E5']);
  });

  it('never moves the current group, earlier groups, or anything into them', () => {
    // currently on E2 (inside B2): B1 and B2 are fixed, B3 can't move above B2.
    expect(moveUpcomingGroup(list, 1, 'B3', 'up')).toBe(list);
    expect(moveUpcomingGroup(list, 1, 'B2', 'down')).toBe(list);
    expect(moveUpcomingGroup(list, 1, 'B1', 'down')).toBe(list);
  });

  it('cannot move past either end', () => {
    expect(moveUpcomingGroup(list, 0, 'B4', 'down')).toBe(list);
    expect(moveUpcomingGroup(list, 0, 'B2', 'up')).toBe(list);
  });

  it('replays a saved order, keeping groups it does not mention at the end', () => {
    expect(applySequence(list, ['B1', 'B4', 'B3', 'B2']).map((e) => e.key)).toEqual(['E1', 'E5', 'E4', 'E2', 'E3']);
    expect(applySequence(list, ['B4', 'B1']).map((e) => e.key)).toEqual(['E5', 'E1', 'E2', 'E3', 'E4']);
    expect(applySequence(list, undefined)).toBe(list);
  });

  it('detects a reorder of the original groups but not an addition', () => {
    const base = ['B1', 'B2', 'B3'];
    expect(isReordered(base, ['B1', 'added:a', 'B2', 'B3'])).toBe(false);
    expect(isReordered(base, ['B1', 'B3', 'B2'])).toBe(true);
    expect(isReordered(base, ['B1', 'B2'])).toBe(true);
  });

  it('counts a reorder as an override', () => {
    expect(hasSessionOverrides({ reordered: true })).toBe(true);
  });
});

describe('sessionOverridesFromProgress', () => {
  const base = [ex('E1', 'B1', 0), ex('E2', 'B2', 1), ex('E3', 'B3', 2)];

  it('reports nothing for a session with no changes', () => {
    const out = sessionOverridesFromProgress({ index: 2, swaps: {}, edits: {}, added: [] }, base);
    expect(out.has).toBe(false);
    expect(out.sequence).toBeUndefined();
  });

  it('works for an old session that recorded additions but no order: derives it from where they were inserted', () => {
    // How the real session looked: items added after E2, then after that addition, then after E3.
    const added = [
      { key: 'a', afterKey: 'E2', exercise: { exercise_code: 'X1', name: 'Bench' }, sets: 4, reps: '10' },
      { key: 'b', afterKey: 'a', exercise: { exercise_code: 'X2', name: 'Incline' }, sets: 4, reps: '10' },
      { key: 'c', afterKey: 'E3', exercise: { exercise_code: 'X3', name: 'Plank' }, sets: 3, reps: '60s' },
    ];
    const out = sessionOverridesFromProgress({ added, edits: {}, swaps: {} }, base);
    expect(out.has).toBe(true);
    expect(out.added).toBe(added);
    expect(out.sequence).toEqual(['B1', 'B2', 'added:a', 'added:b', 'B3', 'added:c']);
  });

  it('prefers a recorded order and flags a pure reorder', () => {
    const out = sessionOverridesFromProgress({ sequence: ['B1', 'B3', 'B2'] }, base);
    expect(out.has).toBe(true);
    expect(out.sequence).toEqual(['B1', 'B3', 'B2']);
  });

  it('tolerates missing progress', () => {
    expect(sessionOverridesFromProgress(null, base).has).toBe(false);
  });
});
