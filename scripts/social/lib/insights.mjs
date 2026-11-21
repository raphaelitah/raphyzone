// Per-post Instagram insights: fetch + normalise into social_weekly_metrics columns.
// Instagram rejects the whole request if one metric is unsupported for the media type, so we
// ask for everything at once and fall back to one request per metric.
import { get } from './instagram.mjs';

// API metric name -> our column ('follows' has no column; it is kept in `raw`).
export const METRICS = {
  reach: 'reach',
  views: 'views',
  likes: 'likes',
  comments: 'comments',
  saved: 'saves',
  shares: 'shares',
  profile_visits: 'profile_visits',
  follows: 'follows',
};

// Insights response -> { metric: number }. Handles both `values: [{value}]` and `total_value: {value}`.
export function parseInsights(json) {
  const out = {};
  for (const m of json?.data || []) {
    const v = m.total_value?.value ?? m.values?.[0]?.value;
    if (typeof v === 'number') out[m.name] = v;
  }
  return out;
}

export async function fetchInsights(mediaId, token) {
  const names = Object.keys(METRICS);
  try {
    return { metrics: parseInsights(await get(`/${mediaId}/insights`, token, { metric: names.join(',') })), errors: {} };
  } catch (batchErr) {
    const metrics = {};
    const errors = {};
    for (const name of names) {
      try {
        Object.assign(metrics, parseInsights(await get(`/${mediaId}/insights`, token, { metric: name })));
      } catch (e) {
        errors[name] = String(e.message).slice(0, 200);
      }
    }
    if (!Object.keys(metrics).length) throw new Error(`No insights available: ${batchErr.message}`);
    return { metrics, errors };
  }
}

// Row for social_weekly_metrics. `follows` and any metric errors live in `raw`.
export function toMetricsRow(postId, weekStart, { metrics, errors }) {
  const row = { post_id: postId, week_start: weekStart, raw: { ...metrics, errors } };
  for (const [api, col] of Object.entries(METRICS)) {
    if (col !== 'follows' && api in metrics) row[col] = Math.round(metrics[api]);
  }
  return row;
}
