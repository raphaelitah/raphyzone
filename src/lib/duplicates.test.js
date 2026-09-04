import { describe, it, expect, vi } from 'vitest';
import { normalizeText, describeSimilarity, findSimilarWorkouts, WORKOUT_SIMILARITY_THRESHOLD } from '@/lib/duplicates';

vi.mock('@/lib/supabaseClient', () => {
  const workouts = [
    { workout_id: 'w-full', name: 'Full Overlap Day', status: 'approved' },
    { workout_id: 'w-partial', name: 'Partial Overlap Day', status: 'approved' },
    { workout_id: 'w-none', name: 'Unrelated Day', status: 'approved' },
  ];
  const blocks = [
    { block_id: 'b-full', workout_id: 'w-full' },
    { block_id: 'b-partial', workout_id: 'w-partial' },
    { block_id: 'b-none', workout_id: 'w-none' },
  ];
  const blockExs = [
    { block_id: 'b-full', step_type: 'exercise', exercise_id: 'squat', exercise_title_raw: null },
    { block_id: 'b-full', step_type: 'exercise', exercise_id: 'bench', exercise_title_raw: null },
    { block_id: 'b-partial', step_type: 'exercise', exercise_id: 'squat', exercise_title_raw: null },
    { block_id: 'b-partial', step_type: 'exercise', exercise_id: 'row', exercise_title_raw: null },
    { block_id: 'b-none', step_type: 'exercise', exercise_id: 'curl', exercise_title_raw: null },
  ];

  const tableData = { workouts, workout_blocks: blocks, block_exercises: blockExs };

  function makeQuery(table) {
    let rows = tableData[table];
    const query = {
      select: () => query,
      eq: (col, val) => { rows = rows.filter((r) => r[col] === val); return query; },
      neq: (col, val) => { rows = rows.filter((r) => r[col] !== val); return query; },
      limit: () => Promise.resolve({ data: rows }),
    };
    return query;
  }

  return { supabase: { from: (table) => makeQuery(table) } };
});

describe('normalizeText', () => {
  it('trims, lowercases, and collapses internal whitespace', () => {
    expect(normalizeText('  Push   Ups  ')).toBe('push ups');
  });

  it('returns an empty string for nullish input', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });
});

describe('describeSimilarity', () => {
  it('formats a percentage and shared-exercise count', () => {
    const match = { score: 0.6667, name: 'Leg Day', sharedCount: 2, totalCount: 3 };
    expect(describeSimilarity(match)).toBe('67% similar to "Leg Day" (shares 2 of 3 exercises).');
  });

  it('returns an empty string when there is no match', () => {
    expect(describeSimilarity(null)).toBe('');
  });
});

describe('findSimilarWorkouts', () => {
  it('returns an empty list when the candidate has no exercises', async () => {
    const result = await findSimilarWorkouts([{ step_type: 'rest' }]);
    expect(result).toEqual([]);
  });

  it('scores full overlap above partial overlap, most similar first', async () => {
    const candidate = [
      { step_type: 'exercise', exercise_id: 'squat' },
      { step_type: 'exercise', exercise_id: 'bench' },
    ];
    const result = await findSimilarWorkouts(candidate);
    expect(result.map((m) => m.workout_id)).toEqual(['w-full', 'w-partial']);
    expect(result[0].score).toBe(1);
    expect(result[0].sharedCount).toBe(2);
    expect(result[1].score).toBeCloseTo(1 / 3);
    expect(result[0].score).toBeGreaterThan(WORKOUT_SIMILARITY_THRESHOLD);
  });

  it('excludes workouts with no shared exercises', async () => {
    const candidate = [{ step_type: 'exercise', exercise_id: 'squat' }, { step_type: 'exercise', exercise_id: 'bench' }];
    const result = await findSimilarWorkouts(candidate);
    expect(result.find((m) => m.workout_id === 'w-none')).toBeUndefined();
  });

  it('excludes the workout being edited via excludeWorkoutId', async () => {
    const candidate = [{ step_type: 'exercise', exercise_id: 'squat' }, { step_type: 'exercise', exercise_id: 'bench' }];
    const result = await findSimilarWorkouts(candidate, { excludeWorkoutId: 'w-full' });
    expect(result.find((m) => m.workout_id === 'w-full')).toBeUndefined();
  });
});
