import { describe, it, expect } from 'vitest';
import { estimateStructureSeconds, adjustedDurationMinutes } from './customDuration';

const block = (block_id, order_index, extra = {}) => ({ block_id, order_index, rounds: 1, ...extra });
const be = (block_exercise_id, block_id, order_in_block, extra = {}) => ({ block_exercise_id, block_id, order_in_block, step_type: 'exercise', ...extra });
const sets = (id, n, reps = 10) => Array.from({ length: n }, (_, i) => ({ block_exercise_id: id, set_number: i + 1, target_reps: reps }));

describe('estimateStructureSeconds', () => {
  it('counts every prescribed set, with rest between them', () => {
    const one = estimateStructureSeconds([block('B1', 0)], [be('E1', 'B1', 0, { prescription_type: 'reps', prescription_value: '10' })], sets('E1', 1));
    const four = estimateStructureSeconds([block('B1', 0)], [be('E1', 'B1', 0, { prescription_type: 'reps', prescription_value: '10' })], sets('E1', 4));
    // 10 reps x 3s = 30s a set; 4 sets = 120s work + 3 x 45s rest
    expect(one).toBe(30);
    expect(four).toBe(4 * 30 + 3 * 45);
  });

  it('infers reps and time for exercises stored without a prescription_type (added mid-workout)', () => {
    const reps = estimateStructureSeconds([block('B1', 0)], [be('E1', 'B1', 0, { prescription_value: '10' })], sets('E1', 1));
    const time = estimateStructureSeconds([block('B1', 0)], [be('E1', 'B1', 0, { prescription_value: '60s' })], sets('E1', 1, null));
    expect(reps).toBe(30);
    expect(time).toBe(60);
  });

  it('uses a timed block\'s cap and block rounds', () => {
    expect(estimateStructureSeconds([block('B1', 0, { workout_format: 'amrap', time_cap_sec: 600 })], [be('E1', 'B1', 0)], [])).toBe(600);
    const rounds = estimateStructureSeconds([block('B1', 0, { rounds: 3, rest_between_rounds_sec: 20 })], [be('E1', 'B1', 0, { prescription_type: 'reps', prescription_value: '10' })], []);
    expect(rounds).toBe(3 * 30 + 2 * 20);
  });

  it('adds timed rest steps and ignores other step types', () => {
    const total = estimateStructureSeconds(
      [block('B1', 0)],
      [be('E1', 'B1', 0, { prescription_type: 'reps', prescription_value: '10' }), be('R1', 'B1', 1, { step_type: 'rest', prescription_value: '60s' }), be('X', 'B1', 2, { step_type: 'note' })],
      sets('E1', 1)
    );
    expect(total).toBe(30 + 60);
  });
});

describe('adjustedDurationMinutes', () => {
  it('keeps the authored duration when nothing changed', () => {
    expect(adjustedDurationMinutes(30, 1200, 1200)).toBe(30);
  });

  it('adds the extra time of added exercises to the authored duration', () => {
    const original = estimateStructureSeconds([block('B1', 0)], [be('E1', 'B1', 0, { prescription_type: 'reps', prescription_value: '10' })], sets('E1', 3));
    const withExtras = estimateStructureSeconds(
      [block('B1', 0), block('B2', 1), block('B3', 2), block('B4', 3)],
      [
        be('E1', 'B1', 0, { prescription_type: 'reps', prescription_value: '10' }),
        be('E2', 'B2', 0, { prescription_value: '10' }), // bench 4 x 10
        be('E3', 'B3', 0, { prescription_value: '10' }), // incline bench 4 x 10
        be('E4', 'B4', 0, { prescription_value: '60s' }), // plank 3 x 60s
      ],
      [...sets('E1', 3), ...sets('E2', 4), ...sets('E3', 4), ...sets('E4', 3, null)]
    );
    // three extra exercises: roughly 4 + 4 + 4.5 minutes on top of the authored 30
    const minutes = adjustedDurationMinutes(30, original, withExtras);
    expect(minutes).toBeGreaterThanOrEqual(40);
    expect(minutes).toBeLessThanOrEqual(50);
  });

  it('shrinks when exercises are removed, never below 5, and falls back without a declared duration', () => {
    expect(adjustedDurationMinutes(30, 1800, 0)).toBe(5);
    expect(adjustedDurationMinutes(null, 0, 1500)).toBe(25);
  });
});
