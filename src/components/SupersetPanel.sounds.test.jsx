import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, cleanup, act, fireEvent } from '@testing-library/react';

const events = [];
vi.mock('@/lib/timerSounds', () => ({
  playCountdownBeep: () => events.push('tick'),
  playGoBeep: () => events.push('go'),
  primeTimerAudio: () => {},
  isTimerAudioMuted: () => false,
  setTimerAudioMuted: () => {},
}));

import SupersetPanel from './SupersetPanel';

beforeEach(() => { events.length = 0; vi.useFakeTimers(); });
afterEach(() => { vi.useRealTimers(); cleanup(); });

const exercises = [{ key: 'a', exercise_name: 'Push-up' }];
const sec = (n) => { for (let i = 0; i < n; i++) act(() => { vi.advanceTimersByTime(1000); }); };
const click = (name) => act(() => { fireEvent.click(screen.getByRole('button', { name })); });

describe('SupersetPanel / solo sets / ladders / circuits', () => {
  it('lead-in beeps 3-2-1 then Go', () => {
    render(<SupersetPanel exercises={exercises} rounds={2} restSec={30} />);
    click(/start set/i);
    sec(10);
    expect(events).toEqual(['tick', 'tick', 'tick', 'go']);
  });

  it.each([30, 10, 5, 4])('rest of %is beeps 3-2-1 then Go', (rest) => {
    render(<SupersetPanel exercises={exercises} rounds={2} restSec={rest} />);
    click(/start set/i);
    sec(10);
    events.length = 0;
    click(/done/i);
    sec(rest);
    expect(events).toEqual(['tick', 'tick', 'tick', 'go']);
  });
});
