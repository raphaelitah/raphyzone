#!/usr/bin/env node
// Pulls Instagram insights for recently published posts into social_weekly_metrics, so the
// planner and the Sunday recap can see what performed.
//   node scripts/social/collect-metrics.mjs [--days 14]
// Each metric is requested on its own and a failing one is skipped (not every metric exists for
// every media type), so one unsupported metric never loses the others.
import { getServiceClient, mondayOf, addDays } from './lib/env.mjs';
import { getToken, get } from './lib/instagram.mjs';
import { parseInsights } from './lib/recap.mjs';

const METRICS = ['reach', 'saved', 'shares', 'likes', 'comments', 'views'];

export async function collectMetrics(supabase, { days = 14, token } = {}) {
  const tok = token || await getToken(supabase);
  const since = addDays(new Date().toISOString().slice(0, 10), -days);
  const { data: posts, error } = await supabase.from('social_posts').select('id, ig_media_id').eq('status', 'published').not('ig_media_id', 'is', null).gte('published_at', `${since}T00:00:00Z`);
  if (error) throw error;
  const weekStart = mondayOf(new Date());
  let saved = 0;
  for (const p of posts || []) {
    const got = {};
    for (const m of METRICS) {
      try { Object.assign(got, parseInsights(await get(`/${p.ig_media_id}/insights`, tok, { metric: m }))); } catch (e) { console.warn(`  ${p.ig_media_id} ${m}: ${e.message}`); }
    }
    if (!Object.keys(got).length) continue;
    const row = { post_id: p.id, week_start: weekStart, reach: got.reach ?? null, views: got.views ?? null, likes: got.likes ?? null, comments: got.comments ?? null, saves: got.saved ?? null, shares: got.shares ?? null, raw: got };
    const { error: upErr } = await supabase.from('social_weekly_metrics').upsert(row, { onConflict: 'post_id,week_start' });
    if (upErr) console.warn(`  metrics upsert failed for ${p.id}: ${upErr.message}`); else saved++;
  }
  console.log(`Metrics collected for ${saved}/${(posts || []).length} post(s).`);
  return saved;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const i = process.argv.indexOf('--days');
  collectMetrics(getServiceClient(), { days: i > -1 ? Number(process.argv[i + 1]) : 14 }).catch((e) => { console.error(e); process.exit(1); });
}
