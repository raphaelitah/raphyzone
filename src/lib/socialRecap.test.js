import { describe, it, expect } from 'vitest';
import { pickRecapPost, parseInsights } from '../../scripts/social/lib/recap.mjs';

const posts = [
  { id: 'a', slot: 2, kind: 'carousel_humour', hook: 'A' },
  { id: 'b', slot: 1, kind: 'reel_workout', hook: 'B' },
  { id: 'c', slot: 3, kind: 'reel_travel', hook: 'C' },
];

describe('pickRecapPost', () => {
  it('picks the post with the best saves+shares per reach', () => {
    const m = { a: { reach: 1000, saves: 5, shares: 1 }, b: { reach: 1000, saves: 10, shares: 2 }, c: { reach: 200, saves: 12, shares: 4 } };
    expect(pickRecapPost(posts, m).id).toBe('c');
  });
  it('falls back to the earliest reel when there are no metrics', () => {
    expect(pickRecapPost(posts, {}).id).toBe('b');
  });
  it('falls back to the first post when there is no reel', () => {
    expect(pickRecapPost([posts[0]], {}).id).toBe('a');
  });
  it('returns null for no posts and ignores posts without a hook', () => {
    expect(pickRecapPost([], {})).toBeNull();
    expect(pickRecapPost([{ id: 'x', slot: 1, kind: 'reel_workout', hook: '' }], {})).toBeNull();
  });
});

describe('parseInsights', () => {
  it('reads values[0].value and total_value, skipping non-numbers', () => {
    expect(parseInsights({ data: [{ name: 'reach', values: [{ value: 120 }] }, { name: 'saved', total_value: { value: 7 } }, { name: 'x', values: [{ value: 'n/a' }] }] })).toEqual({ reach: 120, saved: 7 });
    expect(parseInsights(null)).toEqual({});
  });
});
