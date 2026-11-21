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
  {
    id: 'interval_timers',
    name: 'Built-in interval timers (EMOM, Tabata)',
    tier: 'free',
    facts: [
      'EMOM and Tabata workouts run a timer inside the workout, one block at a time, with sound cues.',
      'The timer starts with a 10-second lead-in so you can put the phone down before it begins.',
      'You can pause and resume it, and mute the sounds.',
    ],
    moment: 'Propping the phone against a water bottle and trying to watch the clock between sets.',
    avoid: 'Do not describe the timer for formats other than EMOM and Tabata, and do not name the sounds.',
  },
  {
    id: 'supersets',
    name: 'Guided supersets',
    tier: 'free',
    facts: [
      'In a superset block the exercises run back to back: tap to start and stop each one.',
      'A rest period follows every full round through the group, repeated for the number of rounds in the block.',
      'There is a 10-second lead-in before the first set.',
    ],
    moment: 'Losing count of which round you are on while moving between two exercises.',
    avoid: 'Do not claim anything about how many exercises a superset holds.',
  },
  {
    id: 'strength_calibration',
    name: 'Strength calibration',
    tier: 'free',
    facts: [
      'A short set of questions sets your starting weights: for each movement (squat, hinge, horizontal push, vertical push, horizontal pull, vertical pull, olympic / power) you pick an exercise and the weight you can comfortably do for around 8 reps.',
      'You can skip any movement you do not perform.',
      'Your plan weights are recalculated from your answers, and you can redo the calibration later.',
    ],
    moment: 'Guessing your first weight on a new exercise and being either bored or buried.',
    avoid: 'Do not state how long it takes and do not imply it replaces the app logging how sets felt.',
  },
  {
    id: 'personal_records',
    name: 'Personal records',
    tier: 'free',
    facts: [
      'The Progress page tracks your max weight per exercise as personal records.',
      'Tapping a record shows its history: the sets that set a new record, newest first, with a trend.',
      'Records start filling in as soon as you log a workout.',
    ],
    moment: 'Knowing you lifted more than last month but not being able to prove it.',
    avoid: 'Do not invent a record, weight or exercise; keep any example numberless.',
  },
  {
    id: 'equipment_profile',
    name: 'Your equipment, your workouts',
    tier: 'free',
    facts: [
      'In your profile you choose full gym, or pick exactly the equipment you have.',
      'You can add weights you own and set the unit (kg or lb).',
    ],
    moment: 'A saved workout that needs a rack and a sled when you have a bench and a pair of dumbbells.',
    avoid: 'Do not claim every workout automatically fits your equipment; only say you tell the app what you have.',
  },
  {
    id: 'onboarding_goals',
    name: 'Goal and experience setup',
    tier: 'free',
    facts: [
      'On sign-up you pick your primary goal and your experience level.',
      'The app uses them to shape how your training is structured, your exercise selection and your progression pace.',
    ],
    moment: 'Following a program written for someone with a different goal and a different level.',
    avoid: 'Do not list the goals or levels and do not promise results.',
  },
  {
    id: 'plan_history',
    name: 'Previous weeks',
    tier: 'free',
    facts: [
      'A Previous weeks page shows a past week: the plan you had and the sessions you completed.',
      'You can step back through earlier weeks.',
    ],
    moment: 'Wondering whether last week was a good week or just felt like one.',
    avoid: 'Do not claim stats, streaks, charts or insights that were not listed.',
  },
  {
    id: 'custom_warmup',
    name: 'A warm-up you set once',
    tier: 'free',
    facts: [
      'You set your warm-up once in your profile: its length, mobility moves, an optional cardio piece (Skierg, Rower or Assault bike), and warm-up sets of your first movement.',
      'Each part can be switched on or off, and you can add your own mobility exercises.',
    ],
    moment: 'Skipping the warm-up because deciding what to do for it feels like one more task.',
    avoid: 'Do not claim it adapts to the workout or avoids injury.',
  },
  {
    id: 'workout_search',
    name: 'Search workouts by activity and format',
    tier: 'free',
    facts: [
      'You can search the workouts and filter by format: For Time, AMRAP, EMOM, Tabata, Circuit or Bodybuilding.',
      'Your own custom workouts show up first in the results.',
    ],
    moment: 'Scrolling for a quick Tabata and finding nothing but long strength sessions.',
    avoid: 'Do not say how many workouts there are, and do not claim search is smart or personalised.',
  },
  {
    id: 'submit_workouts',
    name: 'Submit your own exercises',
    tier: 'free',
    facts: [
      'You can submit your own exercises and track each submission: pending, approved or rejected.',
    ],
    moment: 'Having an exercise you love that the app does not have yet.',
    avoid: 'Do not promise approval, rewards or that submissions become public.',
  },
  {
    id: 'free_vs_premium',
    name: 'Free vs Premium: what you get',
    tier: 'free_limited',
    facts: [
      'Free: a selection of workouts, the logging and progression suggestions, and a small monthly allowance of AI actions; you can always build your week by hand.',
      'Premium: the full workout library, unlimited AI weekly plans, swaps and substitutes, and customizing any workout.',
      'Premium also gets everything added next.',
    ],
    free: 'See the facts: a selection of workouts, logging and progression, and a small AI allowance.',
    premium: 'The full library, unlimited AI planning, customizing any workout.',
    moment: 'Not knowing what you actually get before you commit to anything.',
    avoid: 'No prices, no number of days, never the word trial, do not state the AI allowance number. Keep it plain and low-pressure.',
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
