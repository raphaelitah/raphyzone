import { describe, it, expect } from 'vitest';
import { validateWorkoutName, suggestWorkoutName, normalizeName, MAX_WORKOUT_NAME } from './workoutNames';

describe('validateWorkoutName', () => {
  const taken = ['Pull (Back + Biceps)', 'My other one'];

  it('accepts a new name and tidies whitespace', () => {
    expect(validateWorkoutName('  Pull   plus chest ', taken)).toEqual({ name: 'Pull plus chest', error: null });
  });

  it('rejects an empty name', () => {
    expect(validateWorkoutName('   ', taken).error).toMatch(/enter a name/i);
    expect(validateWorkoutName(undefined, taken).error).toMatch(/enter a name/i);
  });

  it('rejects the original name or an existing custom name, ignoring case and spacing', () => {
    expect(validateWorkoutName('pull (back + biceps)', taken).error).toMatch(/taken/i);
    expect(validateWorkoutName('  MY   OTHER ONE', taken).error).toMatch(/taken/i);
  });

  it('rejects an over-long name', () => {
    expect(validateWorkoutName('x'.repeat(MAX_WORKOUT_NAME + 1), taken).error).toMatch(/under/i);
    expect(validateWorkoutName('x'.repeat(MAX_WORKOUT_NAME), taken).error).toBeNull();
  });
});

describe('suggestWorkoutName / normalizeName', () => {
  it('suggests a free name and counts up past taken ones', () => {
    expect(suggestWorkoutName('Pull', [])).toBe('Pull (my version)');
    expect(suggestWorkoutName('Pull', ['pull (my version)'])).toBe('Pull (my version) 2');
    expect(suggestWorkoutName('Pull', ['Pull (my version)', 'Pull (my version) 2'])).toBe('Pull (my version) 3');
  });

  it('collapses whitespace', () => {
    expect(normalizeName('  a   b ')).toBe('a b');
  });
});
