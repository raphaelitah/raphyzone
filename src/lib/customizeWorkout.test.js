import { describe, it, expect, vi, beforeEach } from 'vitest';

// A tiny in-memory stand-in for the supabase query builder: every call is
// recorded, and selects return whatever rows the test seeded for that table.
const calls = [];
const tables = {};
const failInsert = new Set(); // tables whose inserts should fail
function builder(table) {
  const state = { table, op: 'select', filters: [], payload: null };
  const run = () => {
    calls.push({ ...state });
    if (state.op === 'insert' && failInsert.has(table)) return { data: null, error: { message: 'boom' } };
    if (state.op === 'insert') {
      tables[table] = [...(tables[table] || []), ...[].concat(state.payload)];
      return { data: null, error: null };
    }
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
    maybeSingle: () => { const r = run(); return Promise.resolve({ data: r.data?.[0] ?? null, error: r.error }); },
    then: (resolve, reject) => Promise.resolve(run()).then(resolve, reject),
  };
  return api;
}
const rpc = vi.fn();
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t) => builder(t), rpc: (...a) => rpc(...a) } }));
vi.mock('@/lib/formatLabel', () => ({ recomputeAndSaveFormatLabel: vi.fn(async () => '') }));

const {
  mapBlockExercises, mapBlocks, orderBlocks, applyOverridesToClone, isPremiumRequiredError, isCustomWorkout,
  saveWorkoutCopy, isNameTakenError, isInvalidNameError, saveAsCustomWorkout, recomputeAndSaveDuration, deleteCustomWorkout,
} = await import('./customizeWorkout');

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

describe('mapBlocks / orderBlocks', () => {
  it('maps blocks by position regardless of codes', () => {
    const map = mapBlocks([block('B2', 1), block('B1', 0)], [block('C1', 0), block('C2', 1)]);
    expect(Object.fromEntries(map)).toEqual({ B1: 'C1', B2: 'C2' });
  });

  it('orders by the listed blocks and keeps unlisted ones after their original predecessor', () => {
    const blocks = [block('C1', 0), block('C2', 1), block('C3', 2), block('C4', 3)];
    // C2 is rest-only (never listed); it stays right after C1, which moves.
    expect(orderBlocks(blocks, ['C4', 'C1', 'C3'])).toEqual(['C4', 'C1', 'C2', 'C3']);
  });

  it('puts an unlisted first block at the start and ignores unknown or duplicate ids', () => {
    const blocks = [block('C1', 0), block('C2', 1)];
    expect(orderBlocks(blocks, ['C2', 'C2', 'nope'])).toEqual(['C1', 'C2']);
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

  it('writes the order the athlete ran it in, placing an added exercise where it was done', async () => {
    tables.workout_blocks = [
      { block_id: 'B1', workout_id: 'W1', order_index: 0, rounds: 1 },
      { block_id: 'B2', workout_id: 'W1', order_index: 1, rounds: 1 },
      { block_id: 'C1', workout_id: 'WC', order_index: 0, rounds: 1 },
      { block_id: 'C2', workout_id: 'WC', order_index: 1, rounds: 1 },
    ];
    await applyOverridesToClone({
      source: { id: 'u-src', workout_id: 'W1' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      added: [{ key: 'a', exercise: { exercise_code: 'EXA', name: 'Plank' }, sets: 3, reps: 30 }],
      sequence: ['B2', 'added:a', 'B1'],
    });
    const addedBlock = writes('workout_blocks', 'insert')[0].payload.block_id;
    const orderWrites = writes('workout_blocks', 'update')
      .filter((c) => c.payload.order_index !== undefined)
      .map((c) => [c.filters[0][2], c.payload.order_index, c.payload.block_label]);
    expect(orderWrites).toEqual([['C2', 0, 'A'], [addedBlock, 1, 'B'], ['C1', 2, 'C']]);
  });

  it('leaves block order and labels alone when no sequence is given', async () => {
    await applyOverridesToClone({
      source: { id: 'u-src', workout_id: 'W1' },
      clone: { id: 'u-clone', workout_id: 'WC' },
      swaps: { E1: { exercise_code: 'EX9', name: 'Row' } },
    });
    expect(writes('workout_blocks', 'update')).toHaveLength(0);
  });
});

describe('save as a named copy', () => {
  beforeEach(() => {
    calls.length = 0;
    failInsert.clear();
    rpc.mockReset();
    Object.keys(tables).forEach((k) => delete tables[k]);
    tables.workouts = [{ id: 'u-src', workout_id: 'W1', est_duration_min: 30 }];
    tables.workout_blocks = [
      { block_id: 'B1', workout_id: 'W1', order_index: 0, rounds: 1 },
      { block_id: 'C1', workout_id: 'WC', order_index: 0, rounds: 1 },
    ];
    tables.block_exercises = [
      { block_exercise_id: 'E1', block_id: 'B1', order_in_block: 0, step_type: 'exercise', prescription_type: 'reps', prescription_value: '10' },
      { block_exercise_id: 'F1', block_id: 'C1', order_in_block: 0, step_type: 'exercise', prescription_type: 'reps', prescription_value: '10' },
    ];
    tables.prescribed_sets = [
      { id: 's1', block_exercise_id: 'E1', set_number: 1, target_reps: 10 },
      { id: 's2', block_exercise_id: 'F1', set_number: 1, target_reps: 10 },
    ];
  });

  const writes = (table, op) => calls.filter((c) => c.table === table && c.op === op);
  const copy = { id: 'u-copy', workout_id: 'WC', source_workout_id: 'W1' };
  const source = { id: 'u-src', workout_id: 'W1' };

  it('asks the database for a new copy under the chosen name', async () => {
    rpc.mockResolvedValue({ data: copy, error: null });
    await expect(saveWorkoutCopy('u-src', 'Pull + chest')).resolves.toBe(copy);
    expect(rpc).toHaveBeenCalledWith('save_workout_copy', { p_workout_id: 'u-src', p_name: 'Pull + chest' });
  });

  it('surfaces a taken or invalid name so the form can say so', async () => {
    rpc.mockResolvedValue({ data: null, error: { code: '23505', message: 'name_taken' } });
    const err = await saveWorkoutCopy('u-src', 'Pull').catch((e) => e);
    expect(isNameTakenError(err)).toBe(true);
    expect(isInvalidNameError({ code: '22023' })).toBe(true);
    expect(isNameTakenError({ code: '42501' })).toBe(false);
  });

  it('writes the changes into the new copy only, then re-estimates its duration from the original', async () => {
    rpc.mockResolvedValue({ data: copy, error: null });
    const saved = await saveAsCustomWorkout({
      source,
      name: 'Pull + chest',
      added: [{ key: 'a', exercise: { exercise_code: 'EXA', name: 'Bench' }, sets: 4, reps: '10' }],
      sequence: ['B1', 'added:a'],
    });
    expect(saved).toBe(copy);
    // the added exercise went into the copy's workout, never the original
    expect(writes('workout_blocks', 'insert').every((c) => c.payload.workout_id === 'WC')).toBe(true);
    // duration written to the copy: the authored 30 min plus the extra exercise
    const durationWrite = writes('workouts', 'update').find((c) => c.payload.est_duration_min != null);
    expect(durationWrite.filters).toEqual([['eq', 'id', 'u-copy']]);
    expect(durationWrite.payload.est_duration_min).toBeGreaterThan(30);
  });

  it('removes the half-built copy if writing the changes fails, so the name is not left taken', async () => {
    rpc.mockResolvedValue({ data: copy, error: null });
    failInsert.add('workout_blocks');
    await expect(saveAsCustomWorkout({
      source, name: 'Pull + chest', added: [{ key: 'a', exercise: { exercise_code: 'EXA', name: 'Bench' }, sets: 1, reps: '10' }],
    })).rejects.toBeTruthy();
    const deleted = writes('workouts', 'delete');
    expect(deleted).toHaveLength(1);
    expect(deleted[0].filters).toEqual([['eq', 'id', 'u-copy']]);
  });

  it('leaves the duration alone for a workout that is not a copy', async () => {
    expect(await recomputeAndSaveDuration({ id: 'x', workout_id: 'W9' })).toBeNull();
    expect(writes('workouts', 'update')).toHaveLength(0);
  });

  it('deletes a custom workout from the bottom up', async () => {
    await deleteCustomWorkout({ id: 'u-copy', workout_id: 'WC' });
    const order = calls.filter((c) => c.op === 'delete').map((c) => c.table);
    expect(order).toEqual(['prescribed_sets', 'block_exercises', 'workout_blocks', 'workouts']);
  });
});
