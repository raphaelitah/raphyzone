// Real Raphyzone catalog data for the content writer: loads workouts with their
// blocks/exercises, filters them by scenario (equipment + time), and turns one
// into a plain-text/structured summary. Every number in a "workout decided" post
// comes from here, never from the LLM.

async function fetchAll(supabase, table, select, build = (q) => q) {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await build(supabase.from(table).select(select)).range(from, from + 999);
    if (error) throw error;
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

export async function loadCatalog(supabase) {
  const workouts = await fetchAll(supabase, 'workouts', '*', (q) => q.eq('status', 'approved').order('workout_id'));
  const ids = workouts.map((w) => w.workout_id);
  const blocks = (await fetchAll(supabase, 'workout_blocks', '*', (q) => q.order('block_id'))).filter((b) => ids.includes(b.workout_id));
  const blockIds = new Set(blocks.map((b) => b.block_id));
  const steps = (await fetchAll(supabase, 'block_exercises', '*', (q) => q.order('block_exercise_id'))).filter((s) => blockIds.has(s.block_id));
  const exercises = await fetchAll(supabase, 'exercises', 'id,exercise_code,name', (q) => q.order('id'));
  const exName = new Map();
  for (const e of exercises) {
    if (e.exercise_code) exName.set(e.exercise_code, e.name);
    exName.set(e.id, e.name);
  }
  const stepsByBlock = new Map();
  for (const s of steps) (stepsByBlock.get(s.block_id) || stepsByBlock.set(s.block_id, []).get(s.block_id)).push(s);
  const blocksByWorkout = new Map();
  for (const b of blocks) (blocksByWorkout.get(b.workout_id) || blocksByWorkout.set(b.workout_id, []).get(b.workout_id)).push(b);

  return workouts.map((w) => ({
    ...w,
    minutes: Number(w.duration_minutes ?? w.est_duration_min) || null,
    equipmentTokens: equipmentTokens(w.equipment),
    blocks: (blocksByWorkout.get(w.workout_id) || [])
      .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
      .map((b) => ({
        ...b,
        steps: (stepsByBlock.get(b.block_id) || [])
          .sort((x, y) => (x.order_in_block ?? 0) - (y.order_in_block ?? 0))
          .map((s) => ({ ...s, name: exName.get(s.exercise_id) || s.exercise_title_raw || null })),
      })),
  }));
}

export function equipmentTokens(equipment) {
  const out = new Set();
  for (const e of equipment || []) {
    for (const part of String(e).split(',')) {
      const t = part.trim().toLowerCase().replace(/s$/, '');
      if (t) out.add(t);
    }
  }
  return [...out];
}

// Equipment scenarios for "Today's workout, decided". Tokens are the normalised
// (lowercase, singular) values workouts.equipment uses.
export const GYM_SCENARIOS = [
  { label: 'a hotel gym with dumbbells, a bench and a treadmill', tokens: ['dumbbell', 'bench / box', 'bodyweight', 'treadmill', 'bike'], minutes: 30 },
  { label: 'a basic hotel gym: dumbbells and one cardio machine', tokens: ['dumbbell', 'bodyweight', 'treadmill', 'bike', 'rower'], minutes: 25 },
  { label: 'a hotel gym with kettlebells and a pull-up bar', tokens: ['kettlebell', 'dumbbell', 'pull-up bar', 'bench / box', 'bodyweight'], minutes: 30 },
  { label: 'a garage-style gym with a barbell and a rack', tokens: ['barbell', 'dumbbell', 'bench / box', 'pull-up bar', 'bodyweight'], minutes: 40 },
];

export function matchWorkouts(catalog, { tokens, minutes, minMinutes = 10, requireGear = true, minExercises = 3 }) {
  const allowed = new Set(tokens);
  return catalog.filter((w) => {
    if (!w.minutes || w.minutes > minutes || w.minutes < minMinutes) return false;
    if (!w.blocks.length || !w.equipmentTokens.length) return false;
    if (!w.equipmentTokens.every((t) => allowed.has(t))) return false;
    if (requireGear && w.equipmentTokens.every((t) => t === 'bodyweight')) return false;
    if (new Set(w.blocks.flatMap((b) => b.steps.map((s) => s.name))).size < minExercises) return false;
    return w.blocks.every((b) => b.steps.every((s) => s.name));
  });
}

// Prefer free workouts (a viewer who taps through can open them without paying),
// then anything not featured recently, then random.
export function pickWorkout(candidates, recentIds, rng = Math.random) {
  const fresh = candidates.filter((w) => !recentIds.has(w.workout_id));
  const pool = fresh.length ? fresh : candidates;
  const free = pool.filter((w) => w.is_free);
  const from = free.length ? free : pool;
  return from[Math.floor(rng() * from.length)] || null;
}

function prescription(s) {
  const v = s.prescription_value;
  if (!v) return '';
  // Many values already carry their unit ("3 mins", "400m"); only bare numbers get one.
  if (/[a-z]/i.test(v)) return v;
  const unit = { reps: '', time: 's', seconds: 's', distance: 'm', calories: ' cal' }[s.prescription_type] ?? '';
  return `${v}${unit}`;
}

export function summarizeWorkout(w) {
  return {
    workout_id: w.workout_id,
    name: w.name,
    minutes: w.minutes,
    difficulty: w.difficulty,
    format: w.format_label || w.workout_format,
    equipment: w.equipmentTokens,
    blocks: w.blocks.map((b) => ({
      label: b.block_label || b.block_type,
      type: b.block_type,
      rounds: b.rounds ? Number(b.rounds) : null,
      time_cap_sec: b.time_cap_sec ? Number(b.time_cap_sec) : null,
      items: b.steps
        .filter((s) => s.step_type !== 'rest')
        .map((s) => [s.name, prescription(s)].filter(Boolean).join(' × ')),
    })),
  };
}

// Catalog equipment tags can understate what a workout needs (e.g. a workout tagged
// "bodyweight" that contains dumbbell power cleans). For no-equipment content we also
// check exercise names.
const GEAR_WORDS = /barbell|dumbbell|kettlebell|medicine ball|wall ball|clean|jerk|snatch|ring |rings|pull-up|pullup|chin-up|muscle-up|rope|box |sandbag|sled|rower|bike|treadmill|thruster|deadlift|bench/i;

export function isTrulyEquipmentFree(w) {
  return w.blocks.every((b) => b.steps.every((s) => !GEAR_WORDS.test(s.name || '')));
}

export function isGentle(w) {
  return /mobility/i.test(w.modality || '') || (w.difficulty === 'beginner' && !/emom|for_time|amrap|tabata/i.test(w.workout_format || ''));
}
