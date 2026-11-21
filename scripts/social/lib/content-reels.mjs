// Reel formats built in code from real catalog data and fixed app facts. Every scene is explicit
// (script.manual = true), so the renderer draws exactly what is listed here; the model writes only
// the hook, caption and hashtags. Scene "card" types are drawn by render_reels.py (card_frame).
//   reel_levels   one movement pattern, three kinds of gear
//   reel_pick     "pick a number": three moods, each answered with a real workout
//   reel_format   what EMOM / AMRAP / ... mean, plus a real example
//   reel_myth     three myth-vs-truth beats
//   reel_timer    a silent 20 s on / 10 s off interval timer on two moves from a real workout
//   reel_excuse   three common excuses, each answered with a real workout
//   reel_week     a push / pull / legs week from real workouts
//   reel_app      screen recording of a real workout in the app
import { matchWorkouts, pickWorkout, summarizeWorkout, isTrulyEquipmentFree, isGentle, GYM_SCENARIOS } from './workouts.mjs';
import { CAPTION_RULES, SHAPE, pick, fitsCard, buildLadder, buildQuizOptions, FORMAT_KEYS_LIST, fmtKeyOf, MYTH_POOL } from './content-posts.mjs';

export const CODE_REELS = new Set(['reel_levels', 'reel_pick', 'reel_format', 'reel_myth', 'reel_timer', 'reel_excuse', 'reel_week', 'reel_app']);

const PITCH = { seconds: 3.5, card: { type: 'text', kicker: 'Raphyzone', title: 'Raphyzone removes the mental load.' } };
const text = (seconds, kicker, title, sub) => ({ seconds, card: { type: 'text', kicker, title, ...(sub ? { sub } : {}) } });
const SHAPE_FIELDS = '"hook": string, "caption": string (max 700 chars, no hashtags, no call-to-action), "hashtags": string[] (8-12, no # sign, lowercase)';
const prompt = (what, hook, perf, extra = '') =>
  `Write the caption for a short reel: ${what}. The reel is rendered in code from fixed facts; you write only the hook, caption and hashtags. The hook (max 60 chars) ${hook}. Caption: a recognisable moment, 3-5 short lines, then the pitch line. ${extra}${CAPTION_RULES}\n${perf}\nJSON shape: ${SHAPE(SHAPE_FIELDS)}`;
const stripReps = (item) => String(item).replace(/\s*×.*$/, '').trim();
const firstBlockItems = (f, n = 4) => (f.blocks.find((b) => b.items.length)?.items || []).slice(0, n);

export function buildCodeReel({ kind, catalog, exercises, recentIds, used, perf, recentKeys, plan }) {
  if (kind === 'reel_levels') {
    const { pattern, ladder } = buildLadder(exercises, recentKeys, 3);
    const scenes = [
      text(3.5, 'One movement', pattern, 'Same pattern, whatever gear you have.'),
      ...ladder.map((l) => ({ seconds: 4, card: { type: 'list', kicker: String(l.equipment).toUpperCase(), title: pattern, items: l.exercises } })),
      PITCH,
    ];
    return {
      workoutIds: [],
      script: { manual: true, pattern, ladder, scenes, music_mood: 'upbeat' },
      slides: ladder.map((l) => ({ title: l.equipment, body: l.exercises.join(', ') })),
      user: prompt(`the movement pattern "${pattern}" with exercises for ${ladder.length} kinds of gear (${ladder.map((l) => l.equipment).join(', ')})`, 'says the same move works with whatever gear you have', perf, 'Do not describe technique, muscles or benefits. '),
    };
  }

  if (kind === 'reel_pick' || kind === 'reel_excuse') {
    const excuse = kind === 'reel_excuse';
    const archetypes = excuse
      ? [
        { label: 'I’m short on time.', ok: (w) => w.minutes <= 20 },
        { label: 'I’m too tired.', ok: (w) => isGentle(w) },
        { label: 'I have no gear.', ok: (w) => isTrulyEquipmentFree(w) },
        { label: 'I don’t know what to do.', ok: (w) => w.minutes >= 20 && w.minutes <= 35 && !isGentle(w) },
      ]
      : undefined;
    const { options, taken } = buildQuizOptions(catalog, used, recentIds, archetypes);
    if (options.length < 3) throw new Error(`Not enough workouts for ${kind}`);
    const three = options.slice(0, 3);
    const scenes = excuse
      ? [...three.flatMap((o) => [
        { seconds: 2.5, card: { type: 'text', kicker: 'The excuse', title: o.label } },
        { seconds: 4.5, card: { type: 'workout', kicker: 'The answer', facts: o.workout } },
      ]), PITCH]
      : [
        text(3, 'Which workout?', 'Pick a number.'),
        { seconds: 4, card: { type: 'choice', kicker: 'Your mood today', title: 'Which one are you?', options: three.map((o) => o.label) } },
        ...three.map((o, i) => ({ seconds: 4.5, card: { type: 'workout', kicker: `${i + 1} · ${o.label}`, facts: o.workout } })),
        PITCH,
      ];
    return {
      workoutIds: [...taken].slice(0, 3),
      script: { manual: true, quiz: { options: three }, scenes, music_mood: excuse ? 'driving' : 'upbeat' },
      slides: three.map((o) => ({ title: o.label, body: `${o.workout.name} · ${o.workout.minutes} min` })),
      user: excuse
        ? prompt(`three common excuses (${three.map((o) => o.label).join(' / ')}), each answered with a real workout`, 'names the excuse game', perf)
        : prompt('"Pick a number": three moods, each answered with a real workout', 'invites people to pick a number or comment which one they are', perf),
    };
  }

  if (kind === 'reel_format') {
    const recent = new Set(recentKeys.formats);
    const keys = FORMAT_KEYS_LIST.filter((k) => catalog.some((w) => fmtKeyOf(w) === k && w.minutes && fitsCard(summarizeWorkout(w))));
    const fresh = keys.filter((k) => !recent.has(k));
    const key = pick(fresh.length ? fresh : keys);
    if (!key) throw new Error('No workouts with a known format');
    const w = pickWorkout(catalog.filter((x) => fmtKeyOf(x) === key && x.minutes && !used.has(x.workout_id) && fitsCard(summarizeWorkout(x))), recentIds);
    if (!w) throw new Error(`No ${key} workout available`);
    const facts = summarizeWorkout(w);
    const definition = MYTH_POOL.find((m) => m.id === { EMOM: 'emom_rest', AMRAP: 'amrap_fast', TABATA: 'tabata_long' }[key])?.truth || 'For time: finish the listed work as fast as you can with good form.';
    const scenes = [
      text(3, 'Workout formats', `What is ${key === 'FOR TIME' ? 'a For Time' : `an ${key}`}?`),
      { seconds: 6, card: { type: 'format', facts } },
      text(5, 'In plain words', key, definition),
      { seconds: 5, card: { type: 'workout', kicker: `Try ${key === 'FOR TIME' ? 'a For Time' : `an ${key}`}`, facts } },
      PITCH,
    ];
    return {
      workoutIds: [w.workout_id],
      script: { manual: true, format_key: key, definition, workout: facts, scenes, music_mood: 'driving' },
      slides: [{ title: `What is ${key}?`, body: definition }, { title: facts.name, body: `${facts.minutes} min` }],
      user: prompt(`what the ${key} workout format means (${definition}), then a real ${key} workout to try`, `asks or answers "what is ${key}?"`, perf, `${facts.minutes} minutes is the only duration you may mention. `),
    };
  }

  if (kind === 'reel_myth') {
    const recent = new Set(recentKeys.myths);
    const fresh = MYTH_POOL.filter((m) => !recent.has(m.id));
    const myths = [...(fresh.length >= 3 ? fresh : MYTH_POOL)].sort(() => Math.random() - 0.5).slice(0, 3);
    const scenes = [
      ...myths.flatMap((m) => [
        { seconds: 3, card: { type: 'myth', myth: m.myth } },
        { seconds: 6, card: { type: 'myth', myth: m.myth, truth: m.truth } },
      ]),
      PITCH,
    ];
    return {
      workoutIds: [],
      script: { manual: true, myths, myth_ids: myths.map((m) => m.id), scenes, music_mood: 'driving' },
      slides: myths.map((m) => ({ title: `Myth: ${m.myth}`, body: `Truth: ${m.truth}` })),
      user: prompt(`three myth-vs-truth beats (${myths.map((m) => m.myth).join(' | ')})`, 'is a bold, specific tease of the myths', perf),
    };
  }

  if (kind === 'reel_timer') {
    const pool = catalog.filter((w) => w.minutes && !used.has(w.workout_id) && isTrulyEquipmentFree(w) && new Set(w.blocks.flatMap((b) => b.steps.map((s) => s.name))).size >= 2);
    const w = pickWorkout(pool.length ? pool : catalog.filter((x) => x.minutes && isTrulyEquipmentFree(x)), recentIds);
    if (!w) throw new Error('No equipment-free workout for a timer reel');
    const facts = summarizeWorkout(w);
    const moves = [...new Set(facts.blocks.flatMap((b) => b.items.map(stripReps)))].slice(0, 2);
    if (moves.length < 2) throw new Error('Workout has fewer than two moves');
    const timer = { moves, work: 20, rest: 10 };
    const scenes = [
      text(3, 'Rep timer', '20 on. 10 off.', `${moves[0]}, then ${moves[1]}.`),
      { seconds: 50, timer },
      PITCH,
    ];
    return {
      workoutIds: [w.workout_id],
      script: { manual: true, timer, scenes, music_mood: 'driving' },
      slides: [{ title: '20 s on, 10 s off', body: moves.join(' → ') }],
      user: prompt(`a silent 20 seconds on, 10 seconds off interval timer on two moves (${moves.join(', ')}); the viewer just follows along`, 'invites people to press play and follow the timer', perf, 'Do not claim this is a complete workout and do not name a workout. '),
    };
  }

  if (kind === 'reel_week') {
    const chosen = [];
    for (const f of ['push', 'pull', 'legs']) {
      const w = pickWorkout(catalog.filter((x) => (x.movement_focus === f || String(x.split || '').toLowerCase() === f) && x.minutes && !used.has(x.workout_id) && !chosen.some((c) => c.id === x.workout_id) && x.blocks.length), recentIds);
      if (w) chosen.push({ focus: f, id: w.workout_id, facts: summarizeWorkout(w) });
    }
    if (chosen.length < 3) throw new Error('Not enough push/pull/legs workouts for a week reel');
    const days = ['Monday', 'Wednesday', 'Friday'];
    const scenes = [
      text(3, 'This week', 'Your week, already decided.'),
      ...chosen.map((c, i) => ({ seconds: 4.5, card: { type: 'list', kicker: `${days[i]} · ${c.focus}`, title: c.facts.name, items: firstBlockItems(c.facts), sub: `${c.facts.minutes} min` } })),
      PITCH,
    ];
    return {
      workoutIds: chosen.map((c) => c.id),
      script: { manual: true, split: chosen.map((c) => ({ focus: c.focus, name: c.facts.name, minutes: c.facts.minutes })), scenes, music_mood: 'upbeat' },
      slides: chosen.map((c, i) => ({ title: `${days[i]} · ${c.focus}`, body: `${c.facts.name} · ${c.facts.minutes} min` })),
      user: prompt(`a push / pull / legs week from real workouts (${chosen.map((c) => c.facts.name).join(', ')})`, 'makes people want to save or send the week', perf, 'Do not mention any minutes. '),
    };
  }

  // reel_app: screen recording of the workout in the app
  for (const sc of [...GYM_SCENARIOS].sort(() => Math.random() - 0.5)) {
    const w = pickWorkout(matchWorkouts(catalog, sc).filter((x) => !used.has(x.workout_id)), recentIds);
    if (!w) continue;
    const facts = summarizeWorkout(w);
    const scenes = [
      text(3.5, 'Open the app', 'This is what “decided” looks like.'),
      { seconds: 9, tour: { workout: facts.name, headline: 'Pick it. Press start.' } },
      PITCH,
    ];
    return {
      workoutIds: [w.workout_id],
      script: { manual: true, scenario: sc.label, workout: facts, scenes, music_mood: 'upbeat' },
      slides: [{ title: facts.name, body: `${facts.minutes} min · ${facts.equipment.join(', ')}` }],
      user: prompt(`a short screen recording of a real workout (${facts.name}) opened in the Raphyzone app`, 'says what "decided" looks like in the app', perf, `${facts.minutes} minutes is the only duration you may mention. Do not describe any app screen or feature beyond that the workout is already laid out. `),
    };
  }
  throw new Error('No workout available for an app reel');
}
