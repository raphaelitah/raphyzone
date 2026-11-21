import { describe, it, expect } from 'vitest';
import { parseInsights, toMetricsRow } from './insights.mjs';

describe('parseInsights', () => {
  it('reads values[] and total_value shapes', () => {
    expect(parseInsights({ data: [{ name: 'reach', values: [{ value: 120 }] }, { name: 'saved', total_value: { value: 7 } }] })).toEqual({ reach: 120, saved: 7 });
  });
  it('ignores missing or non-numeric values', () => {
    expect(parseInsights({ data: [{ name: 'views', values: [] }, { name: 'likes', values: [{ value: 'x' }] }] })).toEqual({});
    expect(parseInsights(undefined)).toEqual({});
  });
});

describe('toMetricsRow', () => {
  it('maps saved to saves, keeps follows in raw, leaves unavailable columns unset', () => {
    const row = toMetricsRow('p1', '2026-11-23', { metrics: { reach: 100, saved: 4, follows: 2 }, errors: { shares: 'unsupported' } });
    expect(row).toMatchObject({ post_id: 'p1', week_start: '2026-11-23', reach: 100, saves: 4 });
    expect(row.raw.follows).toBe(2);
    expect('shares' in row).toBe(false);
    expect('follows' in row).toBe(false);
  });
});
