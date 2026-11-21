import { describe, it, expect } from 'vitest';
import { storyStatus, recapStatus } from './socialStoryStatus';

describe('storyStatus', () => {
  it('is hidden when the story columns do not exist yet', () => {
    expect(storyStatus({ status: 'draft' })).toBeNull();
    expect(storyStatus(null)).toBeNull();
  });
  it('reports each state', () => {
    expect(storyStatus({ story_asset_url: null }).state).toBe('none');
    expect(storyStatus({ story_asset_url: 'u', status: 'approved' }).state).toBe('ready');
    expect(storyStatus({ story_asset_url: 'u', status: 'published' }).state).toBe('pending');
    expect(storyStatus({ story_asset_url: 'u', story_error: 'boom' })).toMatchObject({ state: 'failed', detail: 'boom' });
    expect(storyStatus({ story_asset_url: 'u', story_media_id: '1', story_error: 'old', story_published_at: 't' })).toMatchObject({ state: 'published', at: 't' });
  });
});

describe('recapStatus', () => {
  it('is null unless the post was picked', () => {
    expect(recapStatus({})).toBeNull();
    expect(recapStatus(null)).toBeNull();
  });
  it('reports picked, ready, failed and published', () => {
    expect(recapStatus({ recap_chosen_at: 't' }).state).toBe('picked');
    expect(recapStatus({ recap_chosen_at: 't', recap_asset_url: 'u' }).state).toBe('ready');
    expect(recapStatus({ recap_chosen_at: 't', recap_story_error: 'x' }).state).toBe('failed');
    expect(recapStatus({ recap_chosen_at: 't', recap_story_media_id: '1' }).state).toBe('published');
  });
});
