// Weekly insights pull: for every published post, fetch lifetime Instagram metrics and upsert one
// snapshot per (post, week) into social_weekly_metrics. The Friday writer reads these to see what
// worked, and the admin page summarises them by post format.
//   node scripts/social/pull-metrics.mjs [--days 90] [--dry]
// Needs the instagram_business_manage_insights permission on the token.
import { getServiceClient, mondayOf } from './lib/env.mjs';
import { getToken } from './lib/instagram.mjs';
import { fetchInsights, toMetricsRow } from './lib/insights.mjs';

const dry = process.argv.includes('--dry');
const daysArg = process.argv.indexOf('--days');
const days = daysArg > -1 ? Number(process.argv[daysArg + 1]) : 90;
const supabase = getServiceClient();
const token = await getToken(supabase);

const since = new Date(Date.now() - days * 86400000).toISOString();
const minAge = new Date(Date.now() - 86400000).toISOString(); // under a day old: numbers are not meaningful yet
const { data: posts, error } = await supabase.from('social_posts')
  .select('id, kind, hook, ig_media_id, published_at')
  .eq('status', 'published').not('ig_media_id', 'is', null)
  .gte('published_at', since).lte('published_at', minAge).order('published_at');
if (error) throw error;

const weekStart = mondayOf(new Date());
let ok = 0;
let failed = 0;
for (const p of posts) {
  try {
    const result = await fetchInsights(p.ig_media_id, token);
    const row = toMetricsRow(p.id, weekStart, result);
    const bad = Object.keys(result.errors);
    if (dry) {
      console.log(`${p.kind} "${(p.hook || '').slice(0, 40)}":`, JSON.stringify({ ...row, raw: undefined }), bad.length ? `(unavailable: ${bad.join(', ')})` : '');
    } else {
      const { error: upErr } = await supabase.from('social_weekly_metrics').upsert(row, { onConflict: 'post_id,week_start' });
      if (upErr) throw upErr;
    }
    ok++;
  } catch (e) {
    failed++;
    console.error(`FAILED ${p.kind} ${p.ig_media_id}: ${e.message}`);
  }
}
console.log(`Metrics: ${ok} posts pulled, ${failed} failed (week of ${weekStart})${dry ? ' [dry run]' : ''}.`);
if (posts.length && !ok) process.exit(1);
