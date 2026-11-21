// Pure helpers for the Sunday recap story and the metrics collector (unit-tested).
import { score } from './planner.mjs';

// Instagram insights come back as { data: [{ name, values: [{ value }] }] } (or total_value).
export function parseInsights(json) {
  const out = {};
  for (const m of json?.data || []) {
    const v = m.values?.[0]?.value ?? m.total_value?.value;
    if (typeof v === 'number') out[m.name] = v;
  }
  return out;
}

// posts: published posts of the week { id, slot, kind, hook, recap_story_media_id? };
// metricsByPost: { [postId]: { reach, saves, shares } }.
// Picks the best post by the same saves/shares-per-reach score the planner uses. With no
// metrics yet, falls back to the week's earliest reel (reels carry the reach), else the first post.
export function pickRecapPost(posts, metricsByPost = {}) {
  const eligible = (posts || []).filter((p) => p.hook);
  if (!eligible.length) return null;
  const scored = eligible.filter((p) => metricsByPost[p.id]?.reach != null);
  if (scored.length) {
    return [...scored].sort((a, b) => score(metricsByPost[b.id]) - score(metricsByPost[a.id]) || a.slot - b.slot)[0];
  }
  const bySlot = [...eligible].sort((a, b) => a.slot - b.slot);
  return bySlot.find((p) => p.kind.startsWith('reel')) || bySlot[0];
}
