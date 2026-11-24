// Core finisher: an optional bodyweight abs routine offered after a workout.
//
// Shape: laps of 3 exercises, each worked 40s on / 20s off, then a closing
// 1-minute plank hold. The number of 40/20 intervals ("rounds") is a multiple
// of 3 (default 9 = 3 laps = 9 min), so the whole thing is `rounds + 1` minutes.
//
// Pure functions only (no DB / network) so they are unit-testable. Rotation is
// driven by the last couple of finishers' picks, which the caller persists.

export const FINISHER_WORK_SEC = 40;
export const FINISHER_REST_SEC = 20;
export const FINISHER_PLANK_SEC = 60;
export const FINISHER_SLOTS_PER_LAP = 3;
export const FINISHER_ROUND_OPTIONS = [3, 6, 9, 12];
export const FINISHER_DEFAULT_ROUNDS = 9;
// How many past finishers to avoid repeating.
const HISTORY_DEPTH = 2;

// `group` keeps a lap varied (we prefer one exercise per group); `plankish`
// entries are plank-position work, of which a lap gets at most one because the
// finisher already ends with a plank.
// An entry with `moves` is a left/right pair: if it is picked, every move in it
// is in the lap, back to back (so it costs one slot per move).
export const FINISHER_POOL = [
  { id: 'alternating-toe-taps', name: 'Alternating toe taps', group: 'flexion', cue: 'On your back, legs up. Reach one hand to the opposite toe, then switch.' },
  { id: 'legs-up-touch-toes', name: 'Legs in the air, touch your toes', group: 'flexion', cue: 'Legs straight up. Curl your shoulders off the floor and reach for your toes.' },
  { id: 'hollow-rock', name: 'Hollow rock', group: 'anti_extension', cue: 'Hold a hollow body and rock back and forth. Keep your lower back pressed down.' },
  { id: 'hollow-hold', name: 'Hollow hold', group: 'anti_extension', cue: 'Arms and legs long, shoulders and feet off the floor, lower back pressed down.' },
  { id: 'glute-bridge', name: 'Glute bridges', group: 'posterior', cue: 'Feet flat, drive your hips up and squeeze at the top.' },
  { id: 'side-taps', name: 'Side taps', group: 'lateral', cue: 'On your back, knees bent. Reach a hand to each heel in turn, shoulders off the floor.' },
  { id: 'sit-ups', name: 'Sit-ups', group: 'flexion', cue: 'Sit all the way up and lower with control.' },
  { id: 'crunches', name: 'Crunches', group: 'flexion', cue: 'Curl your ribs toward your hips and keep your neck relaxed.' },
  { id: 'russian-twists', name: 'Russian twists', group: 'rotation', cue: 'Lean back, feet up or down, and rotate your torso side to side.' },
  { id: 'leg-raises', name: 'Leg raises', group: 'lower', cue: 'Lower your straight legs slowly and stop before your back arches.' },
  { id: 'flutter-kicks', name: 'Flutter kicks', group: 'lower', cue: 'Small, fast kicks with your legs low and your lower back pressed down.' },
  { id: 'bicycle-kicks', name: 'Bicycle kicks', group: 'rotation', cue: 'Bring opposite elbow to knee while the other leg extends.' },
  { id: 'dead-bug', name: 'Dead bug', group: 'anti_extension', cue: 'On your back, arms and knees up. Lower the opposite arm and leg while your lower back stays pressed down.' },
  { id: 'plank-shoulder-taps', name: 'Plank shoulder taps', group: 'anti_rotation', plankish: true, cue: 'From a high plank, tap each shoulder in turn while keeping your hips still.' },
  { id: 'mountain-climbers', name: 'Mountain climbers', group: 'conditioning', plankish: true, cue: 'From a high plank, drive your knees to your chest in a fast, steady rhythm.' },
  { id: 'superman-hold', name: 'Superman hold', group: 'posterior', cue: 'Face down, lift arms, chest and legs off the floor and squeeze your back and glutes.' },
  { id: 'twisting-plank', name: 'Side-to-side twisting plank', group: 'rotation', plankish: true, cue: 'From a plank, rotate your hips side to side without letting your shoulders collapse.' },
  {
    id: 'side-plank',
    name: 'Side plank',
    group: 'lateral',
    plankish: true,
    moves: [
      { id: 'side-plank-left', name: 'Side plank, left', cue: 'Elbow under shoulder, hips high, body in one line. Left side down.' },
      { id: 'side-plank-right', name: 'Side plank, right', cue: 'Elbow under shoulder, hips high, body in one line. Right side down.' },
    ],
  },
];

export const FINISHER_PLANK = { id: 'plank', name: 'Plank hold', cue: 'Forearms down, body in one straight line, squeeze your glutes and abs.' };

export function normalizeFinisherRounds(rounds) {
  return FINISHER_ROUND_OPTIONS.includes(rounds) ? rounds : FINISHER_DEFAULT_ROUNDS;
}

// Total length in minutes: the 40/20 intervals plus the closing plank minute.
export function finisherMinutes(rounds) {
  return normalizeFinisherRounds(rounds) + FINISHER_PLANK_SEC / 60;
}

// Number of laps through the 3-exercise lap.
export function finisherLaps(rounds) {
  return normalizeFinisherRounds(rounds) / FINISHER_SLOTS_PER_LAP;
}

function shuffled(list, rng) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const slotCost = (entry) => (entry.moves ? entry.moves.length : 1);

// Picks the pool entries for one lap (exactly 3 slots). Avoids anything used
// in the last HISTORY_DEPTH finishers (`history` is newest-first, an array of
// arrays of entry ids), prefers distinct groups, and allows at most one
// plank-position entry. Falls back gracefully if the filters leave too little.
export function pickLapEntries(history = [], rng = Math.random) {
  const recent = new Set((history || []).slice(0, HISTORY_DEPTH).flat());
  const fresh = FINISHER_POOL.filter((e) => !recent.has(e.id));
  const candidates = shuffled(fresh.length >= 6 ? fresh : FINISHER_POOL, rng);

  const chosen = [];
  let slots = 0;
  const tryAdd = (entry, { strict }) => {
    if (slots + slotCost(entry) > FINISHER_SLOTS_PER_LAP) return false;
    if (chosen.includes(entry)) return false;
    if (entry.plankish && chosen.some((c) => c.plankish)) return false;
    if (strict && chosen.some((c) => c.group === entry.group)) return false;
    chosen.push(entry);
    slots += slotCost(entry);
    return true;
  };

  for (const entry of candidates) {
    if (slots >= FINISHER_SLOTS_PER_LAP) break;
    tryAdd(entry, { strict: true });
  }
  // Relax the "distinct group" preference if the lap is still short.
  for (const entry of candidates) {
    if (slots >= FINISHER_SLOTS_PER_LAP) break;
    tryAdd(entry, { strict: false });
  }
  return chosen;
}

// Builds a finisher: the lap's exercises (pairs expanded, left before right),
// the closing plank, the timer config for useIntervalTimer, and the entry ids
// to persist as history.
export function buildCoreFinisher({ rounds = FINISHER_DEFAULT_ROUNDS, history = [], rng = Math.random } = {}) {
  const intervals = normalizeFinisherRounds(rounds);
  const entries = pickLapEntries(history, rng);
  const lap = entries.flatMap((e) => (e.moves ? e.moves : [e]))
    .map(({ id, name, cue }) => ({ id, name, cue }));

  return {
    intervals,
    minutes: finisherMinutes(intervals),
    laps: finisherLaps(intervals),
    lap,
    plank: FINISHER_PLANK,
    // The plank is appended as the last "exercise" so the timer's
    // exerciseIndex lines up with [...lap, plank].
    exercises: [...lap, FINISHER_PLANK],
    entryIds: entries.map((e) => e.id),
    timerConfig: {
      mode: 'interval',
      rounds: finisherLaps(intervals),
      exerciseCount: lap.length,
      workSec: FINISHER_WORK_SEC,
      restSec: FINISHER_REST_SEC,
      finalHoldSec: FINISHER_PLANK_SEC,
    },
  };
}

// Newest-first history of the last HISTORY_DEPTH finishers' entry ids.
export function nextFinisherHistory(history, entryIds) {
  return [entryIds, ...(Array.isArray(history) ? history : [])].slice(0, HISTORY_DEPTH);
}
