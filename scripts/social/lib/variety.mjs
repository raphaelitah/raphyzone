// Variety guard for the Friday writer: rejects a hook that echoes a recent hook or another
// hook this week. It does not touch the voice or structure of posts, only repeated openings.

const STOP = new Set(['the', 'a', 'an', 'you', 'your', 'to', 'and', 'of', 'in', 'on', 'it', 'is', 'for', 'with', 'that', 'this', 'at', 'but', 'so', 'just', 'what', 'do', 'are', 'no', 'not']);
const words = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean);
const content = (s) => new Set(words(s).filter((w) => !STOP.has(w)));

// True when `hook` shares its opening words with, or heavily overlaps, any hook in `others`.
export function tooSimilar(hook, others) {
  const first = words(hook).slice(0, 3).join(' ');
  const a = content(hook);
  for (const o of others) {
    if (!o) continue;
    if (first && first === words(o).slice(0, 3).join(' ')) return o;
    const b = content(o);
    const inter = [...a].filter((w) => b.has(w)).length;
    const union = new Set([...a, ...b]).size;
    if (union && inter / union >= 0.5) return o;
  }
  return null;
}
