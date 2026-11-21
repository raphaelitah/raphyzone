#!/usr/bin/env node
// Sunday recap story: "In case you missed it", pointing at the week's pick.
//   node scripts/social/recap-story.mjs pick       collect metrics, choose the pick, mark it
//   node scripts/social/recap-story.mjs publish    post the rendered recap story
// In between, render_stories.py --recap draws and uploads the image (Python does the drawing).
// Set INSTAGRAM_STORIES=off to switch stories off. One recap per week; a failure never touches the post.
import { getServiceClient, mondayOf, addDays } from './lib/env.mjs';
import { getToken, publishStory } from './lib/instagram.mjs';
import { pickRecapPost } from './lib/recap.mjs';
import { collectMetrics } from './collect-metrics.mjs';

const cmd = process.argv[2];
const dry = process.argv.includes('--dry');
const off = /^(off|0|false|no)$/i.test(process.env.INSTAGRAM_STORIES || '');
if (off) { console.log('Stories are off (INSTAGRAM_STORIES).'); process.exit(0); }
const supabase = getServiceClient();
const weekStart = mondayOf(new Date());
const weekPosts = () => supabase.from('social_posts').select('id, slot, kind, hook, recap_chosen_at, recap_asset_url, recap_story_media_id')
  .eq('status', 'published').gte('week_start', weekStart).lt('week_start', addDays(weekStart, 7)).order('slot');

if (cmd === 'pick') {
  const { data: posts, error } = await weekPosts();
  if (error) throw error;
  if (!posts.length) { console.log('No published posts this week; no recap.'); process.exit(0); }
  if (posts.some((p) => p.recap_story_media_id)) { console.log('This week already has a recap story.'); process.exit(0); }
  const token = await getToken(supabase);
  await collectMetrics(supabase, { days: 8, token }).catch((e) => console.warn(`Metrics collection failed (recap falls back to a reel): ${e.message}`));
  const { data: rows } = await supabase.from('social_weekly_metrics').select('post_id, reach, saves, shares').eq('week_start', weekStart);
  const metrics = Object.fromEntries((rows || []).map((r) => [r.post_id, r]));
  const pick = pickRecapPost(posts, metrics);
  console.log(`Recap pick: slot ${pick.slot} ${pick.kind} "${pick.hook}"${dry ? ' [dry run]' : ''}`);
  if (dry) process.exit(0);
  await supabase.from('social_posts').update({ recap_chosen_at: null }).in('id', posts.map((p) => p.id));
  const { error: e2 } = await supabase.from('social_posts').update({ recap_chosen_at: new Date().toISOString(), recap_asset_url: null, updated_date: new Date().toISOString() }).eq('id', pick.id);
  if (e2) throw e2;
} else if (cmd === 'publish') {
  const { data: posts, error } = await weekPosts();
  if (error) throw error;
  const p = posts.find((x) => x.recap_chosen_at && x.recap_asset_url && !x.recap_story_media_id);
  if (!p) { console.log('No recap story ready to publish.'); process.exit(0); }
  console.log(`Publishing recap story for slot ${p.slot}${dry ? ' [dry run]' : ''}`);
  if (dry) process.exit(0);
  try {
    const id = await publishStory(p.recap_asset_url, await getToken(supabase));
    await supabase.from('social_posts').update({ recap_story_media_id: id, recap_story_published_at: new Date().toISOString(), recap_story_error: null, updated_date: new Date().toISOString() }).eq('id', p.id);
    console.log(`Recap story published: ${id}`);
  } catch (e) {
    await supabase.from('social_posts').update({ recap_story_error: String(e.message).slice(0, 500), updated_date: new Date().toISOString() }).eq('id', p.id);
    console.warn(`Recap story failed: ${e.message}`);
    process.exit(1);
  }
} else {
  console.error('Usage: recap-story.mjs pick|publish [--dry]');
  process.exit(2);
}
