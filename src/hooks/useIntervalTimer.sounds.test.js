import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';

const events = [];
vi.mock('@/lib/timerSounds', () => ({
  playCountdownBeep: () => events.push(['tick', Date.now()]),
  playGoBeep: () => events.push(['go', Date.now()]),
  primeTimerAudio: () => {},
  isTimerAudioMuted: () => false,
  setTimerAudioMuted: () => {},
}));

import useIntervalTimer from './useIntervalTimer';
import { deriveBlockTimerConfig } from '@/lib/workoutStructure';

beforeEach(() => { events.length = 0; vi.useFakeTimers(); });
afterEach(() => vi.useRealTimers());

const names = () => events.map((e) => e[0]);

// Runs a timer config through lead-in + `seconds` of running and returns the beeps.
function run(config, seconds) {
  const { result } = renderHook(() => useIntervalTimer(config));
  act(() => result.current.start());
  for (let i = 0; i < seconds; i++) act(() => vi.advanceTimersByTime(1000));
}

const TICK_TICK_TICK_GO = ['tick', 'tick', 'tick', 'go'];

describe('3-2-1 beeps then Go, per workout type', () => {
  it('lead-in before every block (all timer-driven types share it)', () => {
    run({ mode: 'countdown', durationSec: 60 }, 10);
    expect(names()).toEqual(TICK_TICK_TICK_GO);
  });

  it('tabata: lead-in, then work->rest and rest->work boundaries', () => {
    const cfg = { mode: 'interval', rounds: 2, exerciseCount: 1, workSec: 20, restSec: 10 };
    run(cfg, 10 + 20 + 10);
    // lead-in 3-2-1-go, work 3-2-1-go(rest), rest 3-2-1-go(work)
    expect(names()).toEqual([...TICK_TICK_TICK_GO, ...TICK_TICK_TICK_GO, ...TICK_TICK_TICK_GO]);
  });

  it('AMRAP (single countdown): lead-in Go, 3-2-1 before the cap, no Go at the cap', () => {
    run({ mode: 'countdown', durationSec: 30 }, 10 + 30);
    expect(names()).toEqual([...TICK_TICK_TICK_GO, 'tick', 'tick', 'tick']);
  });

  it('EMOM (60s, no rest): 3-2-1 then Go at every minute change', () => {
    const cfg = { mode: 'interval', rounds: 3, exerciseCount: 1, workSec: 60, restSec: 0 };
    run(cfg, 10 + 120);
    expect(names()).toEqual([
      ...TICK_TICK_TICK_GO, // lead-in
      ...TICK_TICK_TICK_GO, // minute 1 -> 2
      ...TICK_TICK_TICK_GO, // minute 2 -> 3
    ]);
  });

  it('circuit / rotating block with exercises + rest', () => {
    const cfg = { mode: 'interval', rounds: 1, exerciseCount: 2, workSec: 30, restSec: 15 };
    run(cfg, 10 + 30 + 15);
    expect(names()).toEqual([...TICK_TICK_TICK_GO, ...TICK_TICK_TICK_GO, ...TICK_TICK_TICK_GO]);
  });

  it('short 5s work / 3s rest phases still get a Go every transition', () => {
    const cfg = { mode: 'interval', rounds: 2, exerciseCount: 1, workSec: 5, restSec: 3 };
    run(cfg, 10 + 5 + 3 + 5);
    const gos = names().filter((n) => n === 'go').length;
    expect(gos).toBe(4); // lead-in, work->rest, rest->work, work->rest
  });

  it('Go lands on the boundary, ticks at ~3s/2s/1s remaining', () => {
    run({ mode: 'countdown', durationSec: 60 }, 10);
    const times = events.map((e) => (e[1] - events[0][1]) / 1000);
    expect(times).toEqual([0, 1, 2, 3]);
  });
});

describe('deriveBlockTimerConfig covers every timer-driven block type', () => {
  const types = [
    ['tabata', { block_type: 'tabata', work_seconds: 20, rest_seconds: 10, rounds: 8 }],
    ['amrap', { block_type: 'amrap', workout_format: 'amrap', time_cap_sec: 600 }],
    ['emom', { block_type: 'emom', rounds: 10, time_cap_sec: 600 }],
    ['superset', { block_type: 'superset', rounds: 3, rest_seconds: 60 }],
  ];
  it.each(types)('%s yields a timer config', (_n, block) => {
    expect(deriveBlockTimerConfig(block, 2, [])).not.toBeNull();
  });
});
