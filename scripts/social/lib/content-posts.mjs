// Extra image-post formats built from real catalog data and fixed app facts. The images are drawn in
// code (render_images.py) from `script`; the model only writes the hook, caption and hashtags.
//   single_equipment  one-screen workout card limited to one kind of gear
//   carousel_quiz     "which workout are you today?": each answer is a real workout
//   carousel_format   what EMOM / AMRAP / ... mean, plus a real example workout
//   carousel_myth     myth vs. truth, from the app's own progression rules and format definitions
//   carousel_exercise one movement pattern, how it looks with different gear
import { matchWorkouts, pickWorkout, summarizeWorkout, isTrulyEquipmentFree, isGentle, GYM_SCENARIOS } from './workouts.mjs';

const pick = (arr, rng = Math.random) => arr[Math.floor(rng() * arr.length)];
const cardRows = (f) => f.blocks.reduce((n, b) => n + b.items.length + 1, 0);
const fitsCard = (f) => f.blocks.length > 0 && cardRows(f) <= 13;
const CAPTION_RULES = 'Caption: open with a recognisable moment, 3-5 short lines, use the exact line "Raphyzone removes the mental load." once, no other claims about the app, do not mention any number of minutes or list exercises (the images carry them).';
const SHAPE = (common) => `{ ${common} }`;

export const EXTRA_KINDS = new Set(['single_equipment', 'carousel_quiz', 'carousel_format', 'carousel_myth', 'carousel_exercise']);

// Equipment-only scenarios. `tokens` are the normalised equipment tokens workouts use.
const EQUIPMENT_ONLY = [
  { label: 'Dumbbells only', tokens: ['dumbbell', 'bodyweight'], minutes: 35 },
  { label: 'Kettlebell only', tokens: ['kettlebell', 'bodyweight'], minutes: 35 },
  { label: 'Barbell and a rack', tokens: ['barbell', 'bench / box', 'bodyweight'], minutes: 45 },
  { label: 'Pull-up bar and nothing else', tokens: ['pull-up bar', 'bodyweight'], minutes: 35 },
  { label: 'Treadmill only', tokens: ['treadmill'], minutes: 40 },
];

const FORMAT_KEYS = ['EMOM', 'AMRAP', 'TABATA', 'FOR TIME'];
const fmtKey = (w) => String(w.format_label || w.workout_format || '').toUpperCase().replace(/_/g, ' ');

// Fixed myth/truth pairs. Every truth is one of the app's own documented behaviours or a format definition.
const MYTHS = [
  { id: 'easy_stay', myth: 'If it felt easy, keep the weight.', truth: 'Log it as easy twice at the same weight and the app proposes a bump. You approve or ignore it.' },
  { id: 'lighter_fail', myth: 'Going lighter means you failed.', truth: 'After two or more hard or failed sessions, the app proposes going down. That is progress management, not defeat.' },
  { id: 'same_jump', myth: 'Every lift should go up by the same amount.', truth: 'The app proposes +2.5 kg for upper-body lifts and +5 kg for lower-body lifts.' },
  { id: 'one_good_day', myth: 'One great session means go heavier.', truth: 'The app looks at two or more recent sessions at the same weight before it suggests changing it.' },
  { id: 'guess_start', myth: 'Starting weights are a guess.', truth: 'They come from a quick strength calibration, scaled by the difficulty you pick.' },
  { id: 'remember_it', myth: 'You have to remember last time’s weights.', truth: 'Every set is logged with the weight you used and how it felt: easy, normal, hard or failed.' },
  { id: 'emom_rest', myth: 'EMOM means a fixed rest between rounds.', truth: 'Every minute on the minute: start the round at the top of each minute and rest whatever is left of it.' },
  { id: 'amrap_fast', myth: 'AMRAP means go as fast as you can.', truth: 'As many rounds as possible: do the listed moves in order, round after round, until the clock runs out.' },
  { id: 'tabata_long', myth: 'Tabata is a long workout.', truth: 'Short bursts: 20 seconds of work, 10 seconds of rest, repeated.' },
];

export async function buildExtraPost({ kind, catalog, exercises, recentIds, used, perf, recentKeys, plan }) {
  if (kind === 'single_equipment') {
    for (const sc of [...EQUIPMENT_ONLY].sort(() => Math.random() - 0.5)) {
      const pool = matchWorkouts(catalog, { tokens: sc.tokens, minutes: sc.minutes, requireGear: sc.tokens.length > 1 && sc.tokens[0] !== 'bodyweight' })
        .filter((w) => !used.has(w.workout_id) && fitsCard(summarizeWorkout(w)));
      const w = pickWorkout(pool, recentIds);
      if (!w) continue;
      const facts = summarizeWorkout(w);
      return {
        workoutIds: [w.workout_id],
        script: { scenario: sc.label, workout: facts, kicker: sc.label.toUpperCase() },
        slides: [{ title: facts.name, body: `${sc.label} · ${facts.minutes} min` }],
        user: `Write the caption for a single-image workout card limited to this gear: "${sc.label}". The image is rendered in code, you write the hook, caption and hashtags. The only duration you may mention is ${facts.minutes} minutes. Use exactly this angle: ${plan.angle || 'a workout built around the gear you actually have.'}\nFACTS: ${JSON.stringify({ name: facts.name, minutes: facts.minutes, format: facts.format })}\nThe hook (max 60 chars) says what the gear is and invites a save. ${CAPTION_RULES.replace('do not mention any number of minutes or ', '')}\n${perf}\nJSON shape: ${SHAPE('"hook": string, "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)')}`,
      };
    }
    throw new Error('No workout fits an equipment card');
  }

  if (kind === 'carousel_quiz') {
    const base = matchWorkouts(catalog, { tokens: ['dumbbell', 'bench / box', 'bodyweight', 'treadmill', 'bike', 'kettlebell', 'pull-up bar'], minutes: 40, minMinutes: 8, requireGear: false });
    const archetypes = [
      { label: 'Short on time', ok: (w) => w.minutes <= 20 },
      { label: 'Low energy', ok: (w) => isGentle(w) },
      { label: 'Full send', ok: (w) => w.minutes >= 30 && !isGentle(w) },
      { label: 'No gear today', ok: (w) => isTrulyEquipmentFree(w) },
    ];
    const taken = new Set();
    const options = [];
    for (const a of archetypes) {
      const w = pickWorkout(base.filter((x) => a.ok(x) && !taken.has(x.workout_id) && !used.has(x.workout_id)), recentIds);
      if (!w) continue;
      taken.add(w.workout_id);
      options.push({ label: a.label, workout: summarizeWorkout(w) });
    }
    if (options.length < 3) throw new Error('Not enough workouts for a quiz');
    return {
      workoutIds: [...taken],
      script: { quiz: { options } },
      slides: [{ title: 'Which workout are you today?', body: options.map((o) => o.label).join(' / ') }, ...options.map((o) => ({ title: o.label, body: `${o.workout.name} · ${o.workout.minutes} min` }))],
      user: `Write the caption for a quiz carousel: "Which workout are you today?". Each swipe is a mood (${options.map((o) => o.label).join(', ')}) answered with a real workout; the slides are rendered in code. The hook (max 60 chars) is the question or a playful version of it. The caption invites people to comment which one they are, then the turn. ${CAPTION_RULES}\n${perf}\nJSON shape: ${SHAPE('"hook": string, "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)')}`,
    };
  }

  if (kind === 'carousel_format') {
    const recent = new Set(recentKeys.formats);
    const keys = FORMAT_KEYS.filter((k) => catalog.some((w) => fmtKey(w) === k && fitsCard(summarizeWorkout(w)) && w.minutes));
    const key = pick(keys.filter((k) => !recent.has(k)).length ? keys.filter((k) => !recent.has(k)) : keys);
    if (!key) throw new Error('No workouts with a known format');
    const w = pickWorkout(catalog.filter((x) => fmtKey(x) === key && x.minutes && !used.has(x.workout_id) && fitsCard(summarizeWorkout(x))), recentIds);
    if (!w) throw new Error(`No ${key} workout available`);
    const facts = summarizeWorkout(w);
    const def = MYTHS.find((m) => m.id === { EMOM: 'emom_rest', AMRAP: 'amrap_fast', TABATA: 'tabata_long' }[key])?.truth;
    const definition = def || 'For time: finish the listed work as fast as you can with good form.';
    return {
      workoutIds: [w.workout_id],
      script: { format_key: key, definition, workout: facts },
      slides: [{ title: `What is ${key}?`, body: definition }, { title: `Try it: ${facts.name}`, body: `${facts.minutes} min · ${facts.equipment.join(', ')}` }],
      user: `Write the caption for a two-step carousel explaining the ${key} workout format (${definition}) and then showing a real ${key} workout to try. Slides are rendered in code. The hook (max 60 chars) asks or answers "what is ${key}?". Caption: a recognisable moment (hearing a format name at the gym and nodding along), then the definition in your own words, then the pitch line. Do not add detail beyond the definition. ${CAPTION_RULES.replace('do not mention any number of minutes or ', '').replace('(the images carry them)', '(the images carry them); ' + facts.minutes + ' minutes is the only duration you may mention')}\n${perf}\nJSON shape: ${SHAPE('"hook": string, "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)')}`,
    };
  }

  if (kind === 'carousel_myth') {
    const recent = new Set(recentKeys.myths);
    const fresh = MYTHS.filter((m) => !recent.has(m.id));
    const pool = [...(fresh.length >= 4 ? fresh : MYTHS)].sort(() => Math.random() - 0.5).slice(0, 4);
    return {
      workoutIds: [],
      script: { myths: pool, myth_ids: pool.map((m) => m.id) },
      slides: [{ title: 'Myths about training', body: 'Swipe to see which are true.' }, ...pool.map((m) => ({ title: `Myth: ${m.myth}`, body: `Truth: ${m.truth}` }))],
      user: `Write the caption for a myth-vs-truth carousel with these ${pool.length} myths (rendered in code from fixed facts, do not restate them):\n${pool.map((m) => `- ${m.myth}`).join('\n')}\nThe hook (max 60 chars) is a bold, specific line that teases the myths. Caption: a recognisable moment where you believed one of them, then the pitch line. ${CAPTION_RULES}\n${perf}\nJSON shape: ${SHAPE('"hook": string, "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)')}`,
    };
  }

  // carousel_exercise: one movement pattern, different gear
  const NO_PATTERN = /cardio|locomotion|mobility|stretch/i;
  const eqLabel = (e) => String(e || 'bodyweight').split(',')[0].trim().toLowerCase().replace(/s$/, '');
  const byPattern = new Map();
  for (const e of exercises) {
    if (!e.movement_pattern || NO_PATTERN.test(e.movement_pattern) || !e.name) continue;
    (byPattern.get(e.movement_pattern) || byPattern.set(e.movement_pattern, []).get(e.movement_pattern)).push(e);
  }
  const recent = new Set(recentKeys.patterns);
  const patterns = [...byPattern.entries()].filter(([, list]) => new Set(list.map((e) => eqLabel(e.equipment))).size >= 3);
  const choices = patterns.filter(([p]) => !recent.has(p));
  const chosen = pick(choices.length ? choices : patterns);
  if (!chosen) throw new Error('No movement pattern with 3+ kinds of gear');
  const [pattern, list] = chosen;
  const byGear = new Map();
  for (const e of list) (byGear.get(eqLabel(e.equipment)) || byGear.set(eqLabel(e.equipment), []).get(eqLabel(e.equipment))).push(e.name);
  const ladder = [...byGear.entries()].sort(() => Math.random() - 0.5).slice(0, 5).map(([equipment, names]) => ({ equipment, exercises: [...new Set(names)].sort(() => Math.random() - 0.5).slice(0, 4) }));
  return {
    workoutIds: [],
    script: { pattern, ladder },
    slides: [{ title: `${pattern}: one pattern, ${ladder.length} kinds of gear`, body: '' }, ...ladder.map((l) => ({ title: l.equipment, body: l.exercises.join(', ') }))],
    user: `Write the caption for a carousel showing one movement pattern, "${pattern}", with exercises for ${ladder.length} kinds of gear (${ladder.map((l) => l.equipment).join(', ')}). Slides are rendered in code. The hook (max 60 chars) says the same move works with whatever gear you have. Caption: the moment when the gym has a different setup than the plan, then the pitch line. Do not describe technique, muscles or benefits, only that the pattern can be done with different gear. ${CAPTION_RULES}\n${perf}\nJSON shape: ${SHAPE('"hook": string, "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)')}`,
  };
}
