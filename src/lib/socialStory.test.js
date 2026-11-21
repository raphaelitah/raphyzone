import { describe, it, expect, vi, afterEach } from 'vitest';
import { publishStory } from '../../scripts/social/lib/instagram.mjs';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(calls) {
  vi.stubGlobal('fetch', vi.fn(async (url, init) => {
    const u = String(url);
    calls.push({ url: u, method: init?.method || 'GET', body: init?.body ? Object.fromEntries(init.body) : null });
    if (u.includes('/me/media_publish')) return { ok: true, json: async () => ({ id: 'story-1' }) };
    if (u.includes('/me/media')) return { ok: true, json: async () => ({ id: 'container-1' }) };
    return { ok: true, json: async () => ({ status_code: 'FINISHED' }) };
  }));
}

describe('publishStory', () => {
  it('creates a STORIES container from the image, waits for it, then publishes it', async () => {
    const calls = [];
    stubFetch(calls);
    const id = await publishStory('https://example.com/story.png', 'tok');
    expect(id).toBe('story-1');
    const create = calls.find((c) => c.method === 'POST' && c.url.endsWith('/me/media'));
    expect(create.body).toMatchObject({ media_type: 'STORIES', image_url: 'https://example.com/story.png' });
    expect(create.body.caption).toBeUndefined();
    expect(calls.find((c) => c.url.endsWith('/me/media_publish')).body.creation_id).toBe('container-1');
  });

  it('refuses without an image', async () => {
    await expect(publishStory('', 'tok')).rejects.toThrow(/no story image/i);
  });
});
