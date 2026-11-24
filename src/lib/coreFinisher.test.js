import { describe, it, expect } from 'vitest';
import {
  FINISHER_POOL, buildCoreFinisher, finisherMinutes, finisherLaps, normalizeFinisherRounds, nextFinisherHistory,
} from '@/lib/coreFinisher';

// Small deterministic PRNG so rotation tests are repeatable.
function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

describe('finisher length', () => {
  it('is the 40/20 intervals plus one plank minute', () => {
    expect(finisherMinutes(9)).toBe(10);
    expect(finisherMinutes(3)).toBe(4);
    expect(finisherMinutes(12)).toBe(13);
  });

  it('splits intervals into laps of 3 exercises', () => {
    expect(finisherLaps(9)).toBe(3);
    expect(finisherLaps(6)).toBe(2);
  });

  it('falls back to 9 for unsupported values', () => {
    expect(normalizeFinisherRounds(7)).toBe(9);
    expect(normalizeFinisherRounds(null)).toBe(9);
    expect(normalizeFinisherRounds(12)).toBe(12);
  });
});

describe('buildCoreFinisher', () => {
  it('builds a 3-exercise lap plus a closing plank and a matching timer config', () => {
    const f = buildCoreFinisher({ rounds: 9, rng: seeded(1) });
    expect(f.lap).toHaveLength(3);
    expect(f.exercises).toHaveLength(4);
    expect(f.exercises[3].name).toBe('Plank hold');
    expect(f.timerConfig).toMatchObject({
      mode: 'interval', rounds: 3, exerciseCount: 3, workSec: 40, restSec: 20, finalHoldSec: 60,
    });
    expect(f.minutes).toBe(10);
  });

  it('never repeats an exercise inside one lap', () => {
    for (let seed = 1; seed <= 200; seed++) {
      const f = buildCoreFinisher({ rng: seeded(seed) });
      expect(new Set(f.lap.map((e) => e.id)).size).toBe(3);
    }
  });

  it('always includes both side planks together, left before right, back to back', () => {
    let sawPair = false;
    for (let seed = 1; seed <= 300; seed++) {
      const f = buildCoreFinisher({ rng: seeded(seed) });
      const ids = f.lap.map((e) => e.id);
      const left = ids.indexOf('side-plank-left');
      const right = ids.indexOf('side-plank-right');
      expect(left === -1).toBe(right === -1);
      if (left !== -1) {
        sawPair = true;
        expect(right).toBe(left + 1);
        expect(f.entryIds).toContain('side-plank');
      }
    }
    expect(sawPair).toBe(true);
  });

  it('has at most one plank-position entry per lap, since the finisher ends in a plank', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const f = buildCoreFinisher({ rng: seeded(seed) });
      const plankish = f.entryIds.filter((id) => FINISHER_POOL.find((e) => e.id === id)?.plankish);
      expect(plankish.length).toBeLessThanOrEqual(1);
    }
  });

  it('prefers a mix of movement groups', () => {
    let allDistinct = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const f = buildCoreFinisher({ rng: seeded(seed) });
      const groups = f.entryIds.map((id) => FINISHER_POOL.find((e) => e.id === id).group);
      if (new Set(groups).size === groups.length) allDistinct++;
    }
    expect(allDistinct).toBeGreaterThan(90);
  });

  it('avoids the exercises used in the last two finishers', () => {
    const history = [['crunches', 'sit-ups', 'hollow-hold'], ['flutter-kicks', 'leg-raises', 'russian-twists']];
    const avoid = new Set(history.flat());
    for (let seed = 1; seed <= 200; seed++) {
      const f = buildCoreFinisher({ history, rng: seeded(seed) });
      expect(f.entryIds.some((id) => avoid.has(id))).toBe(false);
    }
  });

  it('rotates: consecutive finishers share nothing when the history is fed back in', () => {
    let history = [];
    let prev = null;
    const rng = seeded(42);
    for (let i = 0; i < 25; i++) {
      const f = buildCoreFinisher({ history, rng });
      if (prev) expect(f.entryIds.filter((id) => prev.includes(id))).toEqual([]);
      history = nextFinisherHistory(history, f.entryIds);
      prev = f.entryIds;
    }
  });

  it('still produces a full lap when the history excludes most of the pool', () => {
    const history = [FINISHER_POOL.slice(0, 7).map((e) => e.id), FINISHER_POOL.slice(5, 12).map((e) => e.id)];
    const f = buildCoreFinisher({ history, rng: seeded(7) });
    expect(f.lap).toHaveLength(3);
  });
});

describe('nextFinisherHistory', () => {
  it('keeps the newest two finishers, newest first', () => {
    const h1 = nextFinisherHistory([], ['a']);
    const h2 = nextFinisherHistory(h1, ['b']);
    const h3 = nextFinisherHistory(h2, ['c']);
    expect(h3).toEqual([['c'], ['b']]);
  });

  it('tolerates a missing or malformed history', () => {
    expect(nextFinisherHistory(null, ['a'])).toEqual([['a']]);
    expect(nextFinisherHistory({}, ['a'])).toEqual([['a']]);
  });
});
