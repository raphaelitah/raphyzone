import { describe, it, expect } from 'vitest';
import { planWeek, kindScores, featureCoverage } from '../../scripts/social/lib/planner.mjs';
import { FEATURES } from '../../scripts/social/lib/features.mjs';

const seq = (xs) => { let i = 0; return () => xs[i++ % xs.length]; };
const ids = (plans) => plans.map((p) => p.slot);

describe('planWeek', () => {
  it('plans 7 slots with distinct angles', () => {
    const { plans } = planWeek({});
    expect(ids(plans)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    const angles = plans.map((p) => p.angleId).filter(Boolean);
    expect(new Set(angles).size).toBe(angles.length);
  });

  it('adds a second feature spotlight when many features are stale, replacing the weakest swappable slot', () => {
    const perfRows = [
      { kind: 'carousel_humour', reach: 1000, saves: 50, shares: 20 }, { kind: 'carousel_humour', reach: 1000, saves: 40, shares: 10 },
      { kind: 'single_split', reach: 1000, saves: 1, shares: 0 }, { kind: 'single_split', reach: 1000, saves: 0, shares: 0 },
    ];
    const { plans, notes } = planWeek({ perfRows });
    const spot = plans.filter((p) => p.kind === 'carousel_smarter');
    expect(spot).toHaveLength(2);
    expect(plans.find((p) => p.slot === 6).kind).toBe('carousel_smarter');
    expect(new Set(spot.map((p) => p.featureId)).size).toBe(2);
    expect(notes.length).toBe(1);
  });

  it('keeps one spotlight when features were all shown recently, and rotates to the least recently shown', () => {
    const history = FEATURES.map((f, i) => ({ kind: 'carousel_smarter', script: { feature_id: f.id } })); // newest first
    const { plans } = planWeek({ history });
    const spot = plans.filter((p) => p.kind === 'carousel_smarter');
    expect(spot).toHaveLength(1);
    expect(spot[0].featureId).toBe(FEATURES[FEATURES.length - 1].id);
  });

  it('leaves fixed (published/approved) posts alone and avoids their angle and feature', () => {
    const fixed = [{ slot: 1, kind: 'reel_workout', script: { angle_id: 'no_idea' } }];
    const { plans } = planWeek({ fixed, rng: seq([0, 0.5, 0.9]) });
    expect(ids(plans)).not.toContain(1);
    expect(plans.some((p) => p.angleId === 'no_idea')).toBe(false);
  });

  it('does not reuse a recent angle while fresh ones exist', () => {
    const history = [{ script: { angle_id: 'no_idea' } }];
    const { plans } = planWeek({ history });
    expect(plans.some((p) => p.angleId === 'no_idea')).toBe(false);
  });
});

describe('helpers', () => {
  it('kindScores needs 2+ samples per kind', () => {
    expect(kindScores([{ kind: 'a', reach: 100, saves: 5, shares: 0 }])).toEqual({});
    expect(kindScores([{ kind: 'a', reach: 100, saves: 5, shares: 0 }, { kind: 'a', reach: 100, saves: 5, shares: 0 }]).a).toBeCloseTo(0.1);
  });
  it('featureCoverage lists stale features', () => {
    expect(featureCoverage([{ script: { feature_id: FEATURES[0].id } }]).stale).not.toContain(FEATURES[0].id);
  });
});
