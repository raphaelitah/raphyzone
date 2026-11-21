// What to show on the admin Instagram queue about a post's Story teaser and Sunday recap story.
// Returns null for a part that does not apply, or when the columns are missing (migration not
// applied yet), so the card simply shows nothing instead of a wrong state.
//   state: 'published' | 'failed' | 'ready' | 'pending' | 'none' | 'picked'

export function storyStatus(post) {
  if (!post || !('story_asset_url' in post)) return null;
  if (post.story_media_id) return { state: 'published', label: 'Story posted', at: post.story_published_at || null };
  if (post.story_error) return { state: 'failed', label: 'Story failed', detail: post.story_error };
  if (post.story_asset_url) {
    return post.status === 'published'
      ? { state: 'pending', label: 'Story not posted (off, or still to come)' }
      : { state: 'ready', label: 'Story ready, posts with the post' };
  }
  return { state: 'none', label: 'No story image yet' };
}

export function recapStatus(post) {
  if (!post) return null;
  if (post.recap_story_media_id) return { state: 'published', label: 'Recap story posted', at: post.recap_story_published_at || null };
  if (post.recap_story_error) return { state: 'failed', label: 'Recap story failed', detail: post.recap_story_error };
  if (post.recap_chosen_at) return post.recap_asset_url ? { state: 'ready', label: 'Recap story ready' } : { state: 'picked', label: 'Picked for the Sunday recap' };
  return null;
}

export const STORY_STATE_STYLE = {
  published: 'bg-violet-100 text-violet-800',
  failed: 'bg-rose-100 text-rose-800',
  ready: 'bg-emerald-100 text-emerald-800',
  picked: 'bg-sky-100 text-sky-800',
  pending: 'bg-amber-100 text-amber-800',
  none: 'bg-muted text-muted-foreground',
};
