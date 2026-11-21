import { describe, it, expect } from 'vitest';
import { pendingLogToSave, restorePendingLog } from './pendingLog';

const exercises = [{ key: 'E1' }, { key: 'E2' }, { key: 'E3' }];

describe('pendingLogToSave', () => {
  it('keeps an open prompt, drops reviews and empty prompts', () => {
    expect(pendingLogToSave({ keys: ['E2'], blockId: null, review: false })).toEqual({ keys: ['E2'], blockId: null });
    expect(pendingLogToSave({ keys: ['E2'], blockId: 'B1' })).toEqual({ keys: ['E2'], blockId: 'B1' });
    expect(pendingLogToSave({ keys: ['E2'], review: true })).toBeNull();
    expect(pendingLogToSave({ keys: [] })).toBeNull();
    expect(pendingLogToSave(null)).toBeNull();
  });
});

describe('restorePendingLog', () => {
  it('reopens the prompt on its exercise when no result was saved', () => {
    const out = restorePendingLog({ keys: ['E2'], blockId: null }, exercises, {});
    expect(out).toMatchObject({ keys: ['E2'], blockId: null, index: 1 });
    expect(out.entries.E2).toEqual({ difficulty: null, note: '', max_weight: null, bodyweight: false, distance_km: null, duration_seconds: null });
  });

  it('does nothing when the result was already saved, or the exercise is gone', () => {
    expect(restorePendingLog({ keys: ['E2'] }, exercises, { E2: { difficulty: 'normal' } })).toBeNull();
    expect(restorePendingLog({ keys: ['E9'] }, exercises, {})).toBeNull();
    expect(restorePendingLog(null, exercises, {})).toBeNull();
    expect(restorePendingLog({ keys: [] }, exercises, {})).toBeNull();
  });

  it('restores a block prompt and keeps any partial answers already saved for it', () => {
    const out = restorePendingLog({ keys: ['E1', 'E2'], blockId: 'B1' }, exercises, { E1: { difficulty: 'hard', max_weight: 20 } });
    expect(out.blockId).toBe('B1');
    expect(out.index).toBe(0);
    expect(out.entries.E1).toMatchObject({ difficulty: 'hard', max_weight: 20 });
    expect(out.entries.E2.difficulty).toBeNull();
  });
});
