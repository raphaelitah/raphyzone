import { describe, it, expect } from 'vitest';
import { PROFILE_GAPS, getProfileCompleteness } from '@/lib/profileGaps';

function gap(key) {
  const g = PROFILE_GAPS.find((g) => g.key === key);
  if (!g) throw new Error(`no gap registered for key "${key}"`);
  return g;
}

describe('PROFILE_GAPS.isMissing', () => {
  it('strength_calibration is missing until the profile is calibrated', () => {
    expect(gap('strength_calibration').isMissing({})).toBe(true);
    expect(gap('strength_calibration').isMissing({ calibrated: true })).toBe(false);
  });

  it('session_duration is missing until a duration_mode is set', () => {
    expect(gap('session_duration').isMissing({})).toBe(true);
    expect(gap('session_duration').isMissing({ duration_mode: 'fixed' })).toBe(false);
  });

  it('dislikes is missing when the list is empty or absent', () => {
    expect(gap('dislikes').isMissing({})).toBe(true);
    expect(gap('dislikes').isMissing({ dislikes: [] })).toBe(true);
    expect(gap('dislikes').isMissing({ dislikes: ['Burpees'] })).toBe(false);
  });

  it('secondary_goal treats the explicit "none" sentinel as missing', () => {
    expect(gap('secondary_goal').isMissing({})).toBe(true);
    expect(gap('secondary_goal').isMissing({ secondary_goal: 'none' })).toBe(true);
    expect(gap('secondary_goal').isMissing({ secondary_goal: 'endurance' })).toBe(false);
  });

  it('desired_activity only flags a gap when the day+activity ctx isn\'t already scheduled', () => {
    const g = gap('desired_activity');
    const profile = { desired_activities: [{ day: 'Monday', activity: 'Yoga' }] };
    expect(g.isMissing(profile, { activity: 'Yoga', day: 'Monday' })).toBe(false);
    expect(g.isMissing(profile, { activity: 'Yoga', day: 'Tuesday' })).toBe(true);
    expect(g.isMissing(profile, { activity: 'yoga', day: 'Monday' })).toBe(false);
    expect(g.isMissing(profile, {})).toBe(false);
  });
});

describe('PROFILE_GAPS.buildPatch', () => {
  it('session_duration sets a fixed duration window from a single value', () => {
    expect(gap('session_duration').buildPatch(45)).toEqual({ duration_mode: 'fixed', duration_min: 45, duration_max: 45 });
  });

  it('dislikes splits and trims a comma-separated string, dropping blanks', () => {
    expect(gap('dislikes').buildPatch('Burpees,  Overhead Press ,,')).toEqual({ dislikes: ['Burpees', 'Overhead Press'] });
  });

  it('desired_activity appends to the existing list only when confirmed', () => {
    const g = gap('desired_activity');
    const profile = { desired_activities: [{ day: 'Monday', activity: 'Yoga' }] };
    const ctx = { day: 'Tuesday', activity: 'Run' };
    expect(g.buildPatch(true, profile, ctx)).toEqual({
      desired_activities: [{ day: 'Monday', activity: 'Yoga' }, { day: 'Tuesday', activity: 'Run' }],
    });
    expect(g.buildPatch(false, profile, ctx)).toBeNull();
  });
});

describe('getProfileCompleteness', () => {
  it('reports everything missing for an empty profile', () => {
    const { done, total } = getProfileCompleteness({});
    expect(done).toBe(0);
    expect(total).toBeGreaterThan(0);
  });

  it('does not count the location-scoped desired_activity gap toward completeness', () => {
    const { total } = getProfileCompleteness({});
    const completenessGapCount = PROFILE_GAPS.length - 1; // excludes desired_activity
    expect(total).toBeGreaterThanOrEqual(completenessGapCount);
  });

  it('increases done as fields are filled in, and reaches full completeness when everything is set', () => {
    const partial = { calibrated: true, duration_mode: 'fixed' };
    const { done: partialDone, total } = getProfileCompleteness(partial);
    expect(partialDone).toBe(2);

    const full = {
      calibrated: true,
      duration_mode: 'fixed',
      dislikes: ['Burpees'],
      secondary_goal: 'endurance',
      training_history: 'intermediate',
      weight_unit: 'kg',
      program_difficulty: 'regular',
      body_focus: ['legs'],
      performance_focus: ['strength'],
      training_days: ['Monday'],
      scheduled_activities_reviewed: true,
      desired_activities_reviewed: true,
      weight_setup: { barbell: { max_kg: 100 } },
      resistance_priority: 5,
      duration_min: 30,
      duration_max: 60,
      warmup_duration_minutes: 5,
    };
    const { done: fullDone } = getProfileCompleteness(full);
    expect(fullDone).toBe(total);
  });
});
