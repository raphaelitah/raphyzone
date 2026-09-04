import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import useIntervalTimer from './useIntervalTimer';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

// Every start() begins with a 10s lead-in before the first phase actually
// starts counting down; most tests care about behavior once running, so
// this fast-forwards straight past it.
function startAndSkipLeadIn(result) {
  act(() => result.current.start());
  act(() => vi.advanceTimersByTime(10000));
}

describe('lead-in', () => {
  it('enters a leadin status immediately after start(), not running', () => {
    const { result } = renderHook(() => useIntervalTimer({ mode: 'countdown', durationSec: 30 }));
    act(() => result.current.start());
    expect(result.current.status).toBe('leadin');
    expect(result.current.phase).toBe('leadin');
    expect(result.current.remainingSec).toBeCloseTo(10, 0);
  });

  it('transitions to running once the 10s lead-in elapses, without losing time off the first phase', () => {
    const { result } = renderHook(() => useIntervalTimer({ mode: 'countdown', durationSec: 30 }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(9999));
    expect(result.current.status).toBe('leadin');

    act(() => vi.advanceTimersByTime(1));
    expect(result.current.status).toBe('running');
    expect(result.current.remainingSec).toBeCloseTo(30, 0);
  });

  it('does not apply the lead-in again on skipPhase/restart within the same block', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 2, exerciseCount: 1, workSec: 10, restSec: 5 })
    );
    startAndSkipLeadIn(result);
    expect(result.current.status).toBe('running');
    expect(result.current.phase).toBe('work');

    act(() => result.current.skipPhase());
    expect(result.current.status).toBe('running'); // straight into rest, no second lead-in
    expect(result.current.phase).toBe('rest');
  });

  it('can be paused and resumed while counting down', () => {
    const { result } = renderHook(() => useIntervalTimer({ mode: 'countdown', durationSec: 30 }));
    act(() => result.current.start());
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.pause());
    expect(result.current.status).toBe('pausedLeadin');
    expect(result.current.remainingSec).toBeCloseTo(6, 0);

    act(() => vi.advanceTimersByTime(3000)); // time passing while paused shouldn't count
    act(() => result.current.resume());
    expect(result.current.status).toBe('leadin');
    expect(result.current.remainingSec).toBeCloseTo(6, 0);

    act(() => vi.advanceTimersByTime(6000));
    expect(result.current.status).toBe('running');
  });

  it('skipPhase during the lead-in jumps straight into the first phase', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 1, exerciseCount: 1, workSec: 10, restSec: 0 })
    );
    act(() => result.current.start());
    expect(result.current.status).toBe('leadin');

    act(() => result.current.skipPhase());
    expect(result.current.status).toBe('running');
    expect(result.current.phase).toBe('work');
    expect(result.current.remainingSec).toBeCloseTo(10, 0);
  });

  it('catches up through a lead-in that elapsed entirely while backgrounded', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 1, exerciseCount: 1, workSec: 10, restSec: 0 })
    );
    act(() => result.current.start());
    // Jump straight past the lead-in and into the work phase in one tick.
    act(() => vi.advanceTimersByTime(15000));
    expect(result.current.status).toBe('running');
    expect(result.current.phase).toBe('work');
    expect(result.current.remainingSec).toBeCloseTo(5, 0);
  });
});

describe('countdown mode', () => {
  it('exposes a single phase with the configured duration', () => {
    const { result } = renderHook(() => useIntervalTimer({ mode: 'countdown', durationSec: 30 }));
    expect(result.current.phase).toBeNull();
    expect(result.current.phaseDurationSec).toBe(30);
    expect(result.current.totalRounds).toBe(1);
  });

  it('reaches done after the lead-in and duration elapse', () => {
    const { result } = renderHook(() => useIntervalTimer({ mode: 'countdown', durationSec: 5 }));
    startAndSkipLeadIn(result);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.status).toBe('done');
  });
});

describe('interval mode sequence building', () => {
  it('produces round x exercise x (work,rest) phases in order', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 2, exerciseCount: 2, workSec: 10, restSec: 5 })
    );
    startAndSkipLeadIn(result);

    // Round 1, exercise 0, work
    expect(result.current.round).toBe(1);
    expect(result.current.exerciseIndex).toBe(0);
    expect(result.current.phase).toBe('work');

    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.phase).toBe('rest');
    expect(result.current.exerciseIndex).toBe(0);

    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.phase).toBe('work');
    expect(result.current.exerciseIndex).toBe(1);

    act(() => vi.advanceTimersByTime(15000)); // exercise 1 work+rest
    expect(result.current.round).toBe(2);
    expect(result.current.exerciseIndex).toBe(0);
    expect(result.current.phase).toBe('work');
  });

  it('skips the rest phase entirely when restSec is 0 (EMOM-style)', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 3, exerciseCount: 1, workSec: 60, restSec: 0 })
    );
    startAndSkipLeadIn(result);
    expect(result.current.phase).toBe('work');
    expect(result.current.round).toBe(1);

    act(() => vi.advanceTimersByTime(60000));
    expect(result.current.phase).toBe('work');
    expect(result.current.round).toBe(2);
  });

  it('reaches done exactly at the end of the last round, not before', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 2, exerciseCount: 1, workSec: 10, restSec: 0 })
    );
    startAndSkipLeadIn(result);
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.status).toBe('running');
    expect(result.current.round).toBe(2);

    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.status).toBe('done');
  });

  it('does not start the next block already "done" after reset (regression for d66f97a)', () => {
    const { result, rerender } = renderHook(
      ({ config }) => useIntervalTimer(config),
      { initialProps: { config: { mode: 'interval', rounds: 1, exerciseCount: 1, workSec: 5, restSec: 0 } } }
    );
    startAndSkipLeadIn(result);
    act(() => vi.advanceTimersByTime(5000));
    expect(result.current.status).toBe('done');

    act(() => result.current.reset());
    expect(result.current.status).toBe('idle');

    // Simulate moving to a second block's timer with a fresh config.
    rerender({ config: { mode: 'interval', rounds: 1, exerciseCount: 1, workSec: 8, restSec: 0 } });
    expect(result.current.status).toBe('idle');
    act(() => result.current.start());
    expect(result.current.status).toBe('leadin'); // the new block gets its own lead-in
  });
});

describe('pause / resume / skip', () => {
  it('preserves remaining time across a pause/resume once running', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'countdown', durationSec: 10 })
    );
    startAndSkipLeadIn(result);
    act(() => vi.advanceTimersByTime(4000));
    act(() => result.current.pause());
    expect(result.current.status).toBe('paused');
    expect(result.current.remainingSec).toBeCloseTo(6, 0);

    act(() => vi.advanceTimersByTime(3000)); // time passing while paused should not count
    act(() => result.current.resume());
    expect(result.current.remainingSec).toBeCloseTo(6, 0);
  });

  it('skipPhase advances to the next phase immediately', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 1, exerciseCount: 2, workSec: 10, restSec: 5 })
    );
    startAndSkipLeadIn(result);
    expect(result.current.exerciseIndex).toBe(0);
    expect(result.current.phase).toBe('work');

    act(() => result.current.skipPhase());
    expect(result.current.phase).toBe('rest');
    expect(result.current.exerciseIndex).toBe(0);
  });

  it('skipPhase on the last phase finishes the timer', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 1, exerciseCount: 1, workSec: 10, restSec: 0 })
    );
    startAndSkipLeadIn(result);
    act(() => result.current.skipPhase());
    expect(result.current.status).toBe('done');
  });
});

describe('catch-up across large elapsed time', () => {
  it('advances through multiple missed phases at once (e.g. screen locked)', () => {
    const { result } = renderHook(() =>
      useIntervalTimer({ mode: 'interval', rounds: 3, exerciseCount: 1, workSec: 10, restSec: 0 })
    );
    startAndSkipLeadIn(result);
    // Jump past all three rounds in one tick, as if the tab was backgrounded.
    act(() => vi.advanceTimersByTime(35000));
    expect(result.current.status).toBe('done');
  });
});
