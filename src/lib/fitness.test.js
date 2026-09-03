import { describe, it, expect } from 'vitest';
import {
  workoutFormatMatches,
  mondayOf,
  nextMonday,
  fmtISO,
  parseDate,
  sameDay,
  daysBetween,
  shortDay,
  badgeClass,
  youtubeEmbedUrl,
  isRunningWorkout,
  isRunningExercise,
} from './fitness';

describe('workoutFormatMatches', () => {
  it('matches an exact non-mixed format', () => {
    expect(workoutFormatMatches('emom', 'emom')).toBe(true);
    expect(workoutFormatMatches('emom', 'amrap')).toBe(false);
  });

  it('matches a component inside a "mixed(a+b)" format', () => {
    expect(workoutFormatMatches('mixed(emom+amrap)', 'emom')).toBe(true);
    expect(workoutFormatMatches('mixed(emom+amrap)', 'amrap')).toBe(true);
    expect(workoutFormatMatches('mixed(emom+amrap)', 'circuit')).toBe(false);
  });

  it('trims whitespace around mixed components', () => {
    expect(workoutFormatMatches('mixed( emom + amrap )', 'amrap')).toBe(true);
  });

  it('returns false for an empty/nullish format', () => {
    expect(workoutFormatMatches('', 'emom')).toBe(false);
    expect(workoutFormatMatches(null, 'emom')).toBe(false);
  });
});

describe('mondayOf / nextMonday', () => {
  it('returns the same date when given a Monday', () => {
    const monday = new Date('2026-08-31T12:00:00');
    expect(fmtISO(mondayOf(monday))).toBe('2026-08-31');
  });

  it('rolls a mid-week date back to that week\'s Monday', () => {
    const wednesday = new Date('2026-09-02T12:00:00');
    expect(fmtISO(mondayOf(wednesday))).toBe('2026-08-31');
  });

  it('rolls a Sunday back to the Monday that started its week (not the next one)', () => {
    const sunday = new Date('2026-09-06T12:00:00');
    expect(fmtISO(mondayOf(sunday))).toBe('2026-08-31');
  });

  it('nextMonday is exactly 7 days after the current week\'s Monday', () => {
    const wednesday = new Date('2026-09-02T12:00:00');
    expect(fmtISO(nextMonday(wednesday))).toBe('2026-09-07');
  });
});

describe('fmtISO / parseDate round-trip', () => {
  it('parseDate(fmtISO(d)) preserves the calendar day', () => {
    const d = new Date('2026-08-30T23:45:00');
    const iso = fmtISO(d);
    expect(iso).toBe('2026-08-30');
    expect(sameDay(parseDate(iso), d)).toBe(true);
  });
});

describe('sameDay / daysBetween', () => {
  it('sameDay ignores time-of-day', () => {
    const morning = new Date('2026-08-30T06:00:00');
    const night = new Date('2026-08-30T23:00:00');
    expect(sameDay(morning, night)).toBe(true);
  });

  it('daysBetween counts calendar days, not 24h periods', () => {
    const a = new Date('2026-08-30T23:00:00');
    const b = new Date('2026-08-31T01:00:00');
    expect(daysBetween(b, a)).toBe(1);
  });

  it('daysBetween is negative when the second date is later', () => {
    const a = new Date('2026-08-30');
    const b = new Date('2026-09-01');
    expect(daysBetween(a, b)).toBe(-2);
  });
});

describe('shortDay', () => {
  it('formats an ISO date string as a 3-letter weekday', () => {
    expect(shortDay('2026-08-31')).toBe('Mon');
  });
});

describe('badgeClass', () => {
  it('returns the color for a known value', () => {
    expect(badgeClass({ easy: { color: 'text-green-500' } }, 'easy')).toBe('text-green-500');
  });

  it('falls back to a muted default for an unknown value', () => {
    expect(badgeClass({ easy: { color: 'text-green-500' } }, 'unknown')).toBe('text-muted-foreground bg-muted');
  });

  it('falls back for a nullish value', () => {
    expect(badgeClass({}, undefined)).toBe('text-muted-foreground bg-muted');
  });
});

describe('youtubeEmbedUrl', () => {
  it('converts a youtu.be short link', () => {
    expect(youtubeEmbedUrl('https://youtu.be/abc123')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('converts a full youtube.com watch URL', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch?v=abc123&t=10s')).toBe('https://www.youtube.com/embed/abc123');
  });

  it('returns the original URL when it has no recognizable video id', () => {
    expect(youtubeEmbedUrl('https://www.youtube.com/watch')).toBe('https://www.youtube.com/watch');
    expect(youtubeEmbedUrl('https://youtu.be/')).toBe('https://youtu.be/');
  });

  it('returns the original URL for a non-YouTube host', () => {
    expect(youtubeEmbedUrl('https://vimeo.com/12345')).toBe('https://vimeo.com/12345');
  });

  it('returns the input unchanged for an invalid URL, and null for no URL', () => {
    expect(youtubeEmbedUrl('not a url')).toBe('not a url');
    expect(youtubeEmbedUrl(null)).toBeNull();
    expect(youtubeEmbedUrl('')).toBeNull();
  });
});

describe('isRunningWorkout / isRunningExercise', () => {
  it('matches on the exact modality / movement_pattern strings', () => {
    expect(isRunningWorkout({ modality: 'Cyclical / Monostructural' })).toBe(true);
    expect(isRunningWorkout({ modality: 'Strength' })).toBe(false);
    expect(isRunningExercise({ movement_pattern: 'Locomotion / Cardio', modality: 'Cyclical / Monostructural' })).toBe(true);
    expect(isRunningExercise({ movement_pattern: 'Push', modality: 'Cyclical / Monostructural' })).toBe(false);
  });

  it('does not match bodyweight/calisthenics exercises mistagged with the cardio movement pattern', () => {
    expect(isRunningExercise({ movement_pattern: 'Locomotion / Cardio', modality: 'Strength / Muscular Endurance' })).toBe(false);
  });

  it('handles a nullish workout/exercise without throwing', () => {
    expect(isRunningWorkout(null)).toBe(false);
    expect(isRunningExercise(undefined)).toBe(false);
  });
});
