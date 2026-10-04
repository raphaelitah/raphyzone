import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';
import SupersetPanel from './SupersetPanel';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  cleanup();
});

const exercises = [
  { key: 'a', exercise_name: 'Push-up' },
  { key: 'b', exercise_name: 'Row' },
];

function clickStartSet() {
  act(() => { fireEvent.click(screen.getByRole('button', { name: /start set/i })); });
}

describe('SupersetPanel lead-in', () => {
  it('shows a 10s "Get ready" lead-in on the very first Start set; onStartTimer fires at click (cancelling any inter-block rest) but the set itself has not started', () => {
    const onStartTimer = vi.fn();
    render(<SupersetPanel exercises={exercises} rounds={2} restSec={30} onStartTimer={onStartTimer} />);

    clickStartSet();

    expect(screen.getByText('Get ready')).not.toBeNull();
    expect(onStartTimer).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /done/i })).toBeNull();
  });

  it('starts the set (calling onStartTimer again) once the lead-in elapses', () => {
    const onStartTimer = vi.fn();
    render(<SupersetPanel exercises={exercises} rounds={2} restSec={30} onStartTimer={onStartTimer} />);

    clickStartSet();
    act(() => { vi.advanceTimersByTime(9999); });
    expect(screen.getByText('Get ready')).not.toBeNull();
    expect(onStartTimer).toHaveBeenCalledTimes(1);

    act(() => { vi.advanceTimersByTime(1); });
    expect(onStartTimer).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('button', { name: /done/i })).not.toBeNull();
  });

  it('does not repeat the lead-in for the second exercise in the same round', () => {
    const onStartTimer = vi.fn();
    render(<SupersetPanel exercises={exercises} rounds={2} restSec={30} onStartTimer={onStartTimer} />);

    // First exercise: lead-in, then finish its set.
    clickStartSet();
    act(() => { vi.advanceTimersByTime(10000); });
    act(() => { fireEvent.click(screen.getByRole('button', { name: /done/i })); });

    // Second exercise's "Start set" should go straight to running.
    clickStartSet();
    expect(screen.queryByText('Get ready')).toBeNull();
    // click + lead-in end for the first set, then click + start for the second.
    expect(onStartTimer).toHaveBeenCalledTimes(4);
    expect(screen.getByRole('button', { name: /done/i })).not.toBeNull();
  });
});
