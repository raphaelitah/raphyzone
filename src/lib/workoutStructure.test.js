import { describe, it, expect } from 'vitest';
import {
  isEMOMBlock,
  isAlternatingEmomBlock,
  isTabataBlock,
  getEMOMMinutes,
  getEffectiveRounds,
  deriveBlockTimerConfig,
} from './workoutStructure';

describe('isEMOMBlock / isAlternatingEmomBlock / isTabataBlock', () => {
  it('matches on block_type or workout_format, case-insensitively', () => {
    expect(isEMOMBlock({ block_type: 'EMOM' })).toBe(true);
    expect(isEMOMBlock({ workout_format: 'emom' })).toBe(true);
    expect(isEMOMBlock({ block_type: 'emom_alternating' })).toBe(true);
    expect(isEMOMBlock({ block_type: 'superset' })).toBe(false);

    expect(isAlternatingEmomBlock({ block_type: 'emom_alternating' })).toBe(true);
    expect(isAlternatingEmomBlock({ workout_format: 'EMOM_Alternating' })).toBe(true);
    expect(isAlternatingEmomBlock({ block_type: 'emom' })).toBe(false);

    expect(isTabataBlock({ block_type: 'Tabata' })).toBe(true);
    expect(isTabataBlock({ block_type: 'emom' })).toBe(false);
  });
});

describe('getEMOMMinutes', () => {
  it('rounds time_cap_sec to whole minutes', () => {
    expect(getEMOMMinutes({ time_cap_sec: 540 })).toBe(9);
    expect(getEMOMMinutes({ time_cap_sec: 0 })).toBe(0);
    expect(getEMOMMinutes({})).toBe(0);
  });
});

describe('getEffectiveRounds', () => {
  it('divides EMOM minutes by exercise count', () => {
    const block = { block_type: 'emom', time_cap_sec: 540 };
    expect(getEffectiveRounds(block, 3)).toBe(3);
  });

  it('falls back to block.rounds for non-EMOM blocks', () => {
    expect(getEffectiveRounds({ block_type: 'superset', rounds: 4 }, 2)).toBe(4);
    expect(getEffectiveRounds({ block_type: 'superset' }, 2)).toBe(1);
  });

  it('falls back to block.rounds when exerciseCount is 0', () => {
    expect(getEffectiveRounds({ block_type: 'emom', time_cap_sec: 540, rounds: 5 }, 0)).toBe(5);
  });
});

describe('deriveBlockTimerConfig', () => {
  it('returns null for a block with no type/format info', () => {
    expect(deriveBlockTimerConfig({}, 3)).toBeNull();
  });

  it('returns null for a plain (non-timed) block', () => {
    expect(deriveBlockTimerConfig({ block_type: 'superset' }, 3)).toBeNull();
  });

  it('builds a Tabata config from the block fields', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'tabata', work_seconds: 20, rest_seconds: 10, rounds: 8 },
      1
    );
    expect(result).toEqual({
      blockLabel: 'Tabata',
      isEmomFamily: false,
      isAlternatingEmom: false,
      timerDefaultConfig: { workSec: 20, restSec: 10, rounds: 8 },
    });
  });

  it('defaults Tabata work/rest/rounds when unset', () => {
    const result = deriveBlockTimerConfig({ block_type: 'tabata' }, 1);
    expect(result.timerDefaultConfig).toEqual({ workSec: 20, restSec: 10, rounds: 1 });
  });

  it('labels a classic 60s-interval EMOM as "EMOM"', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom', time_cap_sec: 300, rounds: 5 },
      2
    );
    expect(result.blockLabel).toBe('EMOM');
    expect(result.isEmomFamily).toBe(true);
    expect(result.isAlternatingEmom).toBe(false);
    // A default EMOM passes rounds straight through (the timer engine covers
    // all exercises together every round).
    expect(result.timerDefaultConfig).toEqual({ workSec: 60, restSec: 0, rounds: 5 });
  });

  it('labels a non-60s interval as "E<n>MOM"', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom', time_cap_sec: 540, rounds: 3 },
      1
    );
    expect(result.blockLabel).toBe('E3MOM');
    expect(result.timerDefaultConfig.workSec).toBe(180);
  });

  it('divides an alternating EMOM turn count down by exercise count (regression for 5337c32)', () => {
    // "Alternating EMOM x9" cycling 3 exercises: rounds=9 turns total, 3 turns
    // through the group of 3 — must NOT be passed straight through, since the
    // timer multiplies rounds x exerciseCount itself (previously produced 27).
    const result = deriveBlockTimerConfig(
      { block_type: 'emom_alternating', time_cap_sec: 540, rounds: 9 },
      3
    );
    expect(result.isAlternatingEmom).toBe(true);
    expect(result.timerDefaultConfig.rounds).toBe(3);
  });

  it('floors the exercise count at 1 to avoid divide-by-zero', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom_alternating', time_cap_sec: 300, rounds: 5 },
      0
    );
    expect(result.timerDefaultConfig.rounds).toBe(5);
  });

  it('never rounds an alternating EMOM down to 0 rounds', () => {
    const result = deriveBlockTimerConfig(
      { block_type: 'emom_alternating', time_cap_sec: 60, rounds: 1 },
      4
    );
    expect(result.timerDefaultConfig.rounds).toBe(1);
  });

  it('defaults the EMOM interval to 60s when time_cap_sec is unset', () => {
    const result = deriveBlockTimerConfig({ block_type: 'emom', rounds: 1 }, 1);
    expect(result.timerDefaultConfig.workSec).toBe(60);
  });
});
