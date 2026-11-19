import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory stand-in for the supabase query builder: every call is
// recorded, and selects return whatever rows the test seeded for that table.
const calls = [];
const tables = {};
function builder(table) {
  const state = { table, op: 'select', filters: [], payload: null };
  const run = () => {
    calls.push({ ...state });
    if (state.op !== 'select') return { data: null, error: null };
    let rows = tables[table] || [];
    state.filters.forEach(([kind, col, val]) => {
      rows = rows.filter((r) => (kind === 'in' ? val.includes(r[col]) : r[col] === val));
    });
    return { data: rows, error: null };
  };
  const api = {
    select: () => api,
    insert: (payload) => { state.op = 'insert'; state.payload = payload; return api; },
    update: (payload) => { state.op = 'update'; state.payload = payload; return api; },
    delete: () => { state.op = 'delete'; return api; },
    eq: (col, val) => { state.filters.push(['eq', col, val]); return api; },
    in: (col, val) => { state.filters.push(['in', col, val]); return api; },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return api;
}
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t) => builder(t), rpc: vi.fn() } }));

const { mapBlockExercises, applyOverridesToClone, isPremiumRequiredError, isCustomWorkout } = await import('./customizeWorkout');

const block = (block_id, order_index) => ({ block_id, order_index });
const be = (block_exercise_id, block_id, order_in_block) => ({ block_exercise_id, block_id, order_in_block });

describe('mapBlockExercises', () => {
  it('pairs exercises by block position and order within the block, ignoring codes and row order', () => {
    const map = mapBlockExercises(
      [block('B2', 1), block('B1', 0)],
      [be('E3', 'B2', 0), be('E2', 'B1', 1), be('E1', 'B1', 0)],
      [block('C1', 0), block('C2', 1)],
      [be('F1', 'C1', 0), be('F2', 'C1', 1), be('F3', 'C2', 0)]
    );
    expect(Object.fromEntries(map)).toEqual({ E1: 'F1', E2: 'F2', E3: 'F3' });
  });

  it('skips exercises with no counterpart instead of throwing', () => {
    const map = mapBlockExercises([block('B1', 0)], [be('E1', 'B1', 0), be('E2', 'B1', 1)], [block('C1', 0)], [be('F1', 'C1', 0)]);
    expect(Object.fromEntries(map)).toEqual({ E1: 'F1' });
  });
});

describe('isPremiumRequiredError / isCustomWorkout', () => {
  it('recognises the database premium gate', () => {
    expect(isPremiumRequiredError({ code: '42501' })).toBe(true);
    expect(isPremiumRequiredError({ message: 'premium_required' })).toBe(true);
    expect(isPremiumRequiredError({ code: '23505', message: 'dup' })).toBe(false);
    expect(isPremiumRequiredError(null)).toBe(false);
  });

  it('treats only private owned workouts as custom', () => {
    expect(isCustomWorkout({ status: 'private', owner_id: 'u' })).toBe(true);
    expect(isCustomWorkout({ status: 'approved', owner_id: null })).toBe(false);
    expect(isCustomWorkout(null)).toBe(false);
  });
});

describe('applyOverridesToClone', () => {
  beforeEach(() => {
    calls.length = 0;
    Object.keys(tables).forEach((k) => delete tables[k]);
    tables.workout_blocks = [
      { block_id: 'B1', workout_id: 'W1', order_index: 0, rounds: 3 },
      { block_id: 'C1', workout_id: 'WC', order_index: 0, rounds: 3 },
    ];
    tables.block_exercises = [
      { block_exercise_id: 'E1', block_id: 'B1', order_in_block: 0 },
      { block_exercise_id: 'F1', block_id: 'C1', order_in_block: 0 },
    ];
    tables.prescribed_sets = [
      { id: 's1', block_exercise_id: 'F1', set_number: 1, target_reps: 8 },
      { id: 's2', block_exercise_id: 'F1', set_number: 2, target_reps: 8 },
    ];
  });

  const writes = (table, op) => calls.filter((c) => c.table === table && c.op === op);

  it('applies a swap to the clone counterpart of the original exercise, never the original', async () => {
    await applyOverridesToClone({
      source: { id: 'u-src', workout_id: 'W1' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      swaps: { E1: { exercise_code: 'EX9', name: 'Goblet Squat' } },
    });
    const [update] = writes('block_exercises', 'update');
    expect(update.payload).toEqual({ exercise_id: 'EX9', exercise_title_raw: 'Goblet Squat' });
    expect(update.filters).toEqual([['eq', 'block_exercise_id', 'F1']]);
  });

  it('edits sets/reps: rewrites the prescription, folds block rounds into sets, trims extra sets', async () => {
    await applyOverridesToClone({
      source: { id: 'u-src', workout_id: 'W1' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      edits: { E1: { sets: 1, reps: 12 } },
    });
    expect(writes('block_exercises', 'update')[0].payload).toMatchObject({ prescription_value: '12', ladder_start_reps: null });
    expect(writes('workout_blocks', 'update')[0].payload).toEqual({ rounds: 1 });
    expect(writes('prescribed_sets', 'update')).toHaveLength(1);
    expect(writes('prescribed_sets', 'update')[0].payload).toEqual({ target_reps: 12 });
    const [del] = writes('prescribed_sets', 'delete');
    expect(del.filters).toEqual([['in', 'id', ['s2']]]);
  });

  it('adds new sets when the edit asks for more than exist', async () => {
    await applyOverridesToClone({
      source: { id: 'u-src', workout_id: 'W1' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      edits: { E1: { sets: 4, reps: 10 } },
    });
    const [insert] = writes('prescribed_sets', 'insert');
    expect(insert.payload.map((s) => s.set_number)).toEqual([3, 4]);
    expect(insert.payload.every((s) => s.target_reps === 10 && s.block_exercise_id === 'F1')).toBe(true);
  });

  it('appends added exercises as new standalone blocks after the existing ones, in order', async () => {
    await applyOverridesToClone({
      source: { id: 'u-src', workout_id: 'W1' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      added: [
        { exercise: { exercise_code: 'EXA', name: 'Plank' }, sets: 3, reps: 30 },
        { exercise: { exercise_code: 'EXB', name: 'Curl' }, sets: 2, reps: 12 },
      ],
    });
    const blocks = writes('workout_blocks', 'insert').map((c) => c.payload);
    expect(blocks.map((b) => [b.workout_id, b.order_index, b.block_label, b.block_type])).toEqual([
      ['WC', 1, 'B', 'standalone'],
      ['WC', 2, 'C', 'standalone'],
    ]);
    const bes = writes('block_exercises', 'insert').map((c) => c.payload);
    expect(bes.map((b) => [b.exercise_id, b.exercise_title_raw, b.prescription_value, b.block_id])).toEqual([
      ['EXA', 'Plank', '30', blocks[0].block_id],
      ['EXB', 'Curl', '12', blocks[1].block_id],
    ]);
  });

  it('edits a private copy in place when the source already is the copy (identity mapping)', async () => {
    await applyOverridesToClone({
      source: { id: 'u-clone', workout_id: 'WC' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      swaps: { F1: { exercise_code: 'EX7', name: 'Row' } },
    });
    expect(writes('block_exercises', 'update')[0].filters).toEqual([['eq', 'block_exercise_id', 'F1']]);
  });
});
