// Daily publisher: posts every approved, rendered social_posts row whose
// scheduled_date is today or earlier (so a missed day catches up, oldest first,
// max 1 per run to stay well inside Instagram's limits and the one-a-day plan).
//   node scripts/social/publish-due.mjs [--dry]
import { getServiceClient } from './lib/env.mjs';
import { getToken, publishPost } from './lib/instagram.mjs';

const dry = process.argv.includes('--dry');
const supabase = getServiceClient();
const today = new Date().toISOString().slice(0, 10);

const { data: posts, error } = await supabase.from('social_posts').select('*')
  .eq('status', 'approved').eq('render_status', 'rendered').is('ig_media_id', null)
  .lte('scheduled_date', today).order('scheduled_date').order('slot').limit(1);
if (error) throw error;
if (!posts.length) { console.log('Nothing due.'); process.exit(0); }

const p = posts[0];
console.log(`Publishing ${p.kind} ${p.scheduled_date} (${p.id})${dry ? ' [dry run]' : ''}`);
if (dry) process.exit(0);
try {
  const mediaId = await publishPost(p, await getToken(supabase));
  await supabase.from('social_posts').update({
    status: 'published', ig_media_id: mediaId, published_at: new Date().toISOString(), publish_error: null, updated_date: new Date().toISOString(),
  }).eq('id', p.id);
  console.log(`Published: ${mediaId}`);
} catch (e) {
  await supabase.from('social_posts').update({ publish_error: String(e.message).slice(0, 500), updated_date: new Date().toISOString() }).eq('id', p.id);
  console.error(`Publish failed: ${e.message}`);
  process.exit(1);
}
