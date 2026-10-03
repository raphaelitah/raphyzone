// Keeps the Instagram long-lived token alive. Run weekly: tokens last 60 days and
// can be refreshed once they are 24h old, so every run swaps in a fresh one.
// Also does the one-time short-lived -> long-lived exchange if the seed token is
// short-lived (needs META_APP_SECRET).
import { getServiceClient } from './lib/env.mjs';
import { getToken, saveToken, get } from './lib/instagram.mjs';

const supabase = getServiceClient();
let token = await getToken(supabase);
let next;
try {
  next = (await get('https://graph.instagram.com/refresh_access_token', token, { grant_type: 'ig_refresh_token' })).access_token;
} catch (refreshErr) {
  if (!process.env.META_APP_SECRET) throw refreshErr;
  console.log(`Refresh failed (${refreshErr.message}); trying short->long exchange.`);
  const r = await get('https://graph.instagram.com/access_token', token, { grant_type: 'ig_exchange_token', client_secret: process.env.META_APP_SECRET });
  next = r.access_token;
}
await saveToken(supabase, next);
const me = await get('/me', next, { fields: 'username,user_id' });
console.log(`Token refreshed for @${me.username}.`);
