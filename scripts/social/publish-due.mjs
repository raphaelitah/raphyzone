// Daily publisher: posts every approved, rendered social_posts row whose
// scheduled_date is today or earlier (so a missed day catches up, oldest first,
// max 1 per run to stay well inside Instagram's limits and the one-a-day plan).
//   node scripts/social/publish-due.mjs [--dry]
// After the post goes live, a same-day Story teaser (rendered by render_stories.py) is posted too.
// Set INSTAGRAM_STORIES=off to switch stories off; a story failure never fails the run.
import { getServiceClient } from './lib/env.mjs';
import { getToken, publishPost, publishStory } from './lib/instagram.mjs';

const dry = process.argv.includes('--dry');
const supabase = getServiceClient();
const today = new Date().toISOString().slice(0, 10);

const { data: posts, error } = await supabase.from('social_posts').select('*')
  .eq('status', 'approved').eq('render_status', 'rendered').is('ig_media_id', null)
  .lte('scheduled_date', today).order('scheduled_date').order('slot').limit(1);
if (error) throw error;
if (!posts.length) { console.log('Nothing due.'); process.exit(0); }

const p = posts[0];
const storiesOn = !/^(off|0|false|no)$/i.test(process.env.INSTAGRAM_STORIES || '');

// Best effort: the post is already live, so a story problem is recorded and logged, not fatal.
async function postStory(post, token) {
  if (!storiesOn) { console.log('Stories are off (INSTAGRAM_STORIES).'); return; }
  if (!post.story_asset_url) { console.log('No story image for this post; skipping the story.'); return; }
  try {
    await new Promise((r) => setTimeout(r, 20000)); // let the post settle before the teaser
    const storyId = await publishStory(post.story_asset_url, token);
    await supabase.from('social_posts').update({ story_media_id: storyId, story_published_at: new Date().toISOString(), story_error: null, updated_date: new Date().toISOString() }).eq('id', post.id);
    console.log(`Story published: ${storyId}`);
  } catch (e) {
    await supabase.from('social_posts').update({ story_error: String(e.message).slice(0, 500), updated_date: new Date().toISOString() }).eq('id', post.id);
    console.warn(`Story failed (post is live): ${e.message}`);
  }
}
console.log(`Publishing ${p.kind} ${p.scheduled_date} (${p.id})${dry ? ' [dry run]' : ''}`);
if (dry) process.exit(0);
try {
  const token = await getToken(supabase);
  const mediaId = await publishPost(p, token);
  await supabase.from('social_posts').update({
    status: 'published', ig_media_id: mediaId, published_at: new Date().toISOString(), publish_error: null, updated_date: new Date().toISOString(),
  }).eq('id', p.id);
  console.log(`Published: ${mediaId}`);
  await postStory(p, token);
} catch (e) {
  await supabase.from('social_posts').update({ publish_error: String(e.message).slice(0, 500), updated_date: new Date().toISOString() }).eq('id', p.id);
  console.error(`Publish failed: ${e.message}`);
  process.exit(1);
}
