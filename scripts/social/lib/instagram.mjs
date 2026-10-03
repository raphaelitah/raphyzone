// Instagram API (Instagram Login) helpers shared by the publisher and the token
// refresher. The live token is kept in social_credentials (it rotates every ~50
// days); INSTAGRAM_ACCESS_TOKEN is only the seed used the first time.
const GRAPH = 'https://graph.instagram.com/v23.0';

export async function getToken(supabase) {
  const { data } = await supabase.from('social_credentials').select('value').eq('key', 'instagram_access_token').maybeSingle();
  const token = data?.value || process.env.INSTAGRAM_ACCESS_TOKEN;
  if (!token) throw new Error('No Instagram token: set INSTAGRAM_ACCESS_TOKEN.');
  return token;
}

export async function saveToken(supabase, token) {
  const { error } = await supabase.from('social_credentials')
    .upsert({ key: 'instagram_access_token', value: token, updated_date: new Date().toISOString() });
  if (error) throw error;
}

async function call(method, path, token, params = {}) {
  const url = new URL(path.startsWith('http') ? path : `${GRAPH}${path}`);
  const body = new URLSearchParams({ access_token: token, ...params });
  const res = method === 'GET'
    ? await fetch(`${url}${url.search ? '&' : '?'}${body}`)
    : await fetch(url, { method, body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || json.error) throw new Error(json.error?.message || `Instagram API ${res.status}`);
  return json;
}
export const get = (path, token, params) => call('GET', path, token, params);
export const post = (path, token, params) => call('POST', path, token, params);

// Containers (esp. video) are processed asynchronously; wait until FINISHED.
export async function waitReady(id, token, { tries = 40, delayMs = 5000 } = {}) {
  for (let i = 0; i < tries; i++) {
    const { status_code: s, status } = await get(`/${id}`, token, { fields: 'status_code,status' });
    if (s === 'FINISHED') return;
    if (s === 'ERROR' || s === 'EXPIRED') throw new Error(`Media container ${s}: ${status || ''}`);
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error('Timed out waiting for media container.');
}

const isVideo = (u) => /\.(mp4|mov)(\?|$)/i.test(u);

export function postCaption(p) {
  const tags = (p.hashtags || []).map((t) => (t.startsWith('#') ? t : `#${t}`)).join(' ');
  return [p.caption, tags].filter(Boolean).join('\n\n');
}

// Publishes one social_posts row; returns the Instagram media id.
export async function publishPost(p, token) {
  const urls = p.asset_urls || [];
  if (!urls.length) throw new Error('Post has no rendered assets.');
  const caption = postCaption(p);
  let creation;
  if (p.kind.startsWith('reel')) {
    creation = (await post('/me/media', token, { media_type: 'REELS', video_url: urls.find(isVideo) || urls[0], caption, share_to_feed: 'true' })).id;
  } else if (urls.length === 1) {
    creation = (await post('/me/media', token, { image_url: urls[0], caption })).id;
  } else {
    const children = [];
    for (const u of urls.slice(0, 10)) {
      const c = (await post('/me/media', token, { image_url: u, is_carousel_item: 'true' })).id;
      await waitReady(c, token);
      children.push(c);
    }
    creation = (await post('/me/media', token, { media_type: 'CAROUSEL', children: children.join(','), caption })).id;
  }
  await waitReady(creation, token);
  return (await post('/me/media_publish', token, { creation_id: creation })).id;
}
