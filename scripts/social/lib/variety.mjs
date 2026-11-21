// Variety tools for the Friday writer.
//
// 1. STYLES: a storytelling device that changes HOW a post is told (inner monologue, two voices,
//    text to a friend...), to hammer the same message in different ways. Rotated least-recently-used
//    across all post kinds and never repeated within a week. The story rules, the pitch line and
//    the FACTS always come first; a style never adds claims.
// 2. tooSimilar(): rejects a hook that echoes a recent hook or another hook this week.

export const STYLES = [
  { id: 'inner_monologue', text: 'INNER MONOLOGUE. Read as the viewer\'s own thoughts, quick and a little self-mocking, lines that interrupt each other.' },
  { id: 'two_voices', text: 'TWO VOICES. Your brain arguing with itself ("Chest? Legs? Both? Neither."), the argument getting sillier until the turn ends it.' },
  { id: 'escalating_list', text: 'ESCALATING LIST. A short list of small things that each go a bit further than the last, with the last item landing the joke or the feeling.' },
  { id: 'text_message', text: 'MESSAGE TO A FRIEND. Framed as texts you would send a friend about it ("ok so", "no because", "anyway"), casual and specific. Still written to "you", never "I" or "me".' },
  { id: 'deadpan_report', text: 'DEADPAN REPORT. Flat, factual narration of something absurd, as if reporting a weather forecast. The humour is that the voice never reacts.' },
  { id: 'before_after', text: 'BEFORE / AFTER. Two quiet moments side by side: how it feels now, how it feels once it is decided. Show the contrast without exaggerating.' },
  { id: 'myth_vs_reality', text: 'WHAT YOU PICTURED VS WHAT HAPPENED. The plan in your head against what actually unfolded, told without bitterness.' },
  { id: 'tiny_confession', text: 'TINY CONFESSION. Open with a small admission everyone shares ("Confession:"), then keep it warm and slightly funny. Phrase it as "you" ("Confession: you..."), never "I".' },
  { id: 'second_person_scene', text: 'SECOND-PERSON SCENE. One continuous moment narrated slowly in present tense ("You pick up the dumbbell. You put it down."), cinematic and calm.' },
  { id: 'question_chain', text: 'QUESTION CHAIN. Each line is a short question the viewer is already asking, until the last answers them all at once.' },
];

// recent: style ids, most recent first. taken: ids already used by other posts this week.
export function pickStyle(recent, taken = new Set(), rng = Math.random) {
  const free = STYLES.filter((s) => !taken.has(s.id));
  const from = free.length ? free : STYLES;
  const age = (s) => { const i = recent.indexOf(s.id); return i === -1 ? Infinity : i; };
  const best = Math.max(...from.map(age));
  const ties = from.filter((s) => age(s) === best);
  return ties[Math.floor(rng() * ties.length)];
}

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
