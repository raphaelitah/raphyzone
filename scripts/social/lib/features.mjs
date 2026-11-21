// Feature registry: the single source of truth for what Raphyzone can do and what
// is free vs Premium. The Friday writer picks one entry per "feature spotlight" post
// and passes it to the model as FACTS, so posts never invent app capabilities.
//
// KEEP THIS IN SYNC WITH THE APP. When you ship, change or re-tier a feature, edit it
// here (the tier lives in src/lib/entitlements.js, src/components/UpgradeSheet.jsx and
// the `free_ai_actions_per_month` setting). Add entries freely: the picker rotates
// through the pool, least-recently-used first (same logic as angles.mjs).
//
//   id        stable key, stored in the post's script.feature_id
//   name      short label for the admin page and logs
//   tier      'free' | 'premium' | 'free_limited' (free, with a cap; see `free`)
//   facts     what is true about it: the ONLY claims a post may make
//   free      what a free account gets (omit when the tier is 'premium')
//   premium   what Premium adds (omit when there is no difference)
//   moment    a recognisable situation this feature solves, to open the post on
//   avoid     things the model must not claim around it

export const FEATURES = [
  {
    id: 'progression',
    name: 'Automatic progression',
    tier: 'free',
    facts: [
      'Raphyzone logs every set: the weight you used and how it felt (easy / normal / hard / failed).',
      'After 2 or more recent sessions rated "easy" at the same weight, it proposes a bump: +2.5 kg for upper-body lifts, +5 kg for lower-body lifts.',
      'After 2+ "hard" or "failed" it proposes going down. You approve or ignore each suggestion.',
      'Starting weights come from a quick strength calibration, scaled by the program difficulty you pick.',
    ],
    moment: 'Training for months and being unable to say whether you got stronger; a notes app full of half-remembered, crossed-out weights.',
    avoid: 'Do not write specific weights, reps or exercises into the story beyond the +2.5 / +5 kg bumps.',
  },
  {
    id: 'library_free_vs_premium',
    name: 'Workout library: free selection vs full',
    tier: 'free_limited',
    facts: ['Raphyzone has a library of workouts you can start and follow set by set.'],
    free: 'A selection of workouts is free to start, no card needed.',
    premium: 'Premium unlocks the whole library.',
    moment: 'Wanting a different session than the one you always do.',
    avoid: 'Do not state how many workouts exist or how many are free.',
  },
  {
    id: 'ai_weekly_plan',
    name: 'AI weekly plan',
    tier: 'free_limited',
    facts: ['Raphyzone can build your training week for you with AI, and swap or substitute workouts in it.', 'You can also build your week by hand from the library.'],
    free: 'Free accounts get a small monthly allowance of AI actions (plans, swaps, substitutes); building by hand from the library is always open.',
    premium: 'Premium has unlimited AI weekly plans, swaps and substitutes.',
    moment: 'Sunday night, no idea what the week should look like.',
    avoid: 'Do not state the exact monthly allowance, and do not say how the AI decides.',
  },
  {
    id: 'customize_workout',
    name: 'Customize any workout',
    tier: 'premium',
    facts: ['You can change exercises, sets, reps and rest of any workout, in your plan or mid-session, and keep the changes for next time.'],
    premium: 'Customizing is a Premium feature.',
    moment: 'A workout that is almost right: one exercise you hate or cannot do with the gear you have.',
    avoid: 'Do not mention it as free.',
  },
];

// recent: feature ids, most recent first. taken: ids already used this week.
// Least-recently-used first, random among ties.
export function pickFeature(recent, taken = new Set(), rng = Math.random) {
  const free = FEATURES.filter((f) => !taken.has(f.id));
  const from = free.length ? free : FEATURES;
  const age = (f) => { const i = recent.indexOf(f.id); return i === -1 ? Infinity : i; };
  const best = Math.max(...from.map(age));
  const ties = from.filter((f) => age(f) === best);
  return ties[Math.floor(rng() * ties.length)];
}

// FACTS block handed to the model.
export function featureFacts(f) {
  const lines = [`Feature: ${f.name}`, ...f.facts.map((x) => `- ${x}`)];
  if (f.free) lines.push(`Free: ${f.free}`);
  if (f.premium) lines.push(`Premium: ${f.premium}`);
  if (f.tier === 'premium') lines.push('This is a Premium feature; say so plainly, without hard-selling.');
  return lines.join('\n');
}
