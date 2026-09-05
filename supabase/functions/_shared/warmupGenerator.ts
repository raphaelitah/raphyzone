// Rule-based (no LLM) warm up generator. Given the athlete's warm up
// preferences + owned equipment, and the target workout's resolved exercise
// list, produces a structured warm up block: a few mobility exercises, an
// optional cardio machine primer, and a first-movement prep item — trimmed
// to the athlete's preferred warmup_duration_minutes.
//
// Pure function, no DB/network access, so it's unit-testable and safe to call
// from both generateWeeklyPlan and swapWorkout without duplicating logic.

export interface ExerciseRow {
  id: string;
  name: string;
  movement_category?: string | null;
  body_region?: string | null;
  movement_pattern?: string | null;
  primary_muscle_group?: string | null;
  secondary_muscle_group?: string | null;
  equipment_tags?: string[] | null;
  modality?: string | null;
}

export interface WorkoutLike {
  id?: string;
  name?: string;
  workout_category?: string | null;
  split?: string | null;
  modality?: string | null;
  exercises?: { exercise_name?: string; exercise_id?: string }[] | null;
}

export interface WarmupPrefs {
  warmup_duration_minutes?: number | null;
  warmup_include_mobility?: boolean | null;
  warmup_include_cardio?: boolean | null;
  warmup_include_first_movement?: boolean | null;
  warmup_mobility_exercises?: { exercise_id: string; exercise_name: string }[] | null;
  warmup_cardio_options?: string[] | null;
  warmup_first_movement_sets?: number | null;
  warmup_notes?: string | null;
}

export interface WarmupResult {
  generated_at: string;
  duration_minutes: number;
  mobility: { exercise_id: string | null; exercise_name: string; detail: string }[];
  cardio: { machine: string; duration_minutes: number; intensity: string } | null;
  first_movement: { exercise_id: string | null; exercise_name: string; sets: number; detail: string } | null;
  notes: string | null;
}

// Plain-text intensity cue per cardio machine, phrased as an easy warm up
// pace rather than a target for the session itself.
const CARDIO_INTENSITY_CUE: Record<string, string> = {
  'Assault Bike': 'easy, conversational pace (RPE 3-4/10)',
  'Rowing Machine': 'easy pace, around 20-22 spm',
  SkiErg: 'easy pace, around 20-22 spm',
  'Stationary Bike': 'easy spin, light resistance (RPE 3-4/10)',
  Treadmill: 'brisk walk to light jog (RPE 3-4/10)',
  Stairmaster: 'easy, steady pace (RPE 3-4/10)',
};

const CARDIO_MACHINES = ['Assault Bike', 'Rowing Machine', 'SkiErg', 'Stationary Bike', 'Treadmill', 'Stairmaster'];
// Rough intensity ranking, highest first — biases toward higher-intensity
// machines for conditioning-focused workouts when several options tie.
const CARDIO_INTENSITY_ORDER = ['Assault Bike', 'SkiErg', 'Rowing Machine', 'Stairmaster', 'Stationary Bike', 'Treadmill'];

const BODY_REGION_FALLBACK: Record<string, string> = {
  Upper: 'Upper Body',
  Lower: 'Lower Body',
  'Full Body': 'Full Body',
  Push: 'Upper Body',
  Pull: 'Upper Body',
  Legs: 'Lower Body',
  Core: 'Core',
};

function tally<T extends string>(values: (T | null | undefined)[]): T | null {
  const counts: Record<string, number> = {};
  for (const v of values) {
    if (!v) continue;
    counts[v] = (counts[v] || 0) + 1;
  }
  const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return (sorted[0]?.[0] as T) || null;
}

export interface WorkoutFocus {
  body_region: string | null;
  primary_muscle_group: string | null;
  movement_pattern: string | null;
  modality: string | null;
  resolvedExercises: ExerciseRow[];
}

// Derive the workout's dominant body_region/muscle_group/movement_pattern by
// tallying its actual exercises. Falls back to workout_category/split/modality
// when the workout has no resolvable exercise list (common in this catalog —
// many benchmark-style workouts store only a name/description, not a
// structured exercise breakdown).
export function deriveWorkoutFocus(workout: WorkoutLike, exerciseCatalog: ExerciseRow[]): WorkoutFocus {
  const byName = new Map(exerciseCatalog.map((e) => [e.name.trim().toLowerCase(), e]));
  const byId = new Map(exerciseCatalog.map((e) => [e.id, e]));
  const resolved: ExerciseRow[] = [];
  for (const e of workout.exercises || []) {
    const match = (e.exercise_id && byId.get(e.exercise_id)) || (e.exercise_name && byName.get(e.exercise_name.trim().toLowerCase()));
    if (match) resolved.push(match);
  }

  if (resolved.length) {
    return {
      body_region: tally(resolved.map((e) => e.body_region)),
      primary_muscle_group: tally(resolved.map((e) => e.primary_muscle_group)),
      movement_pattern: tally(resolved.map((e) => e.movement_pattern)),
      modality: workout.modality || tally(resolved.map((e) => e.modality)),
      resolvedExercises: resolved,
    };
  }

  // Fallback: no structured exercise data on this workout — infer from its
  // category/split/modality fields instead.
  const region =
    BODY_REGION_FALLBACK[workout.split || ''] ||
    BODY_REGION_FALLBACK[workout.workout_category || ''] ||
    (workout.workout_category as string) ||
    null;
  return {
    body_region: region,
    primary_muscle_group: null,
    movement_pattern: null,
    modality: workout.modality || null,
    resolvedExercises: [],
  };
}

function equipmentSatisfied(exercise: ExerciseRow, available: Set<string>): boolean {
  const tags = exercise.equipment_tags || [];
  if (!tags.length) return true; // no equipment requirement (e.g. bodyweight) — always fine
  return tags.every((t) => available.has(t));
}

// Deterministic per-workout shuffle (mulberry32 seeded by the workout id) so
// picks vary from workout to workout without being random on every re-fetch
// of the *same* workout (which would make the preview flicker between loads).
function seededShuffle<T>(items: T[], seed: string): T[] {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (Math.imul(h, 31) + seed.charCodeAt(i)) | 0;
  let state = h >>> 0 || 1;
  const rand = () => {
    state |= 0; state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const shuffled = [...items];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

function pickMobilityFromCatalog(
  focus: WorkoutFocus,
  exerciseCatalog: ExerciseRow[],
  available: Set<string>,
  count: number,
  exclude: Set<string>,
  seed: string
): ExerciseRow[] {
  const candidates = exerciseCatalog.filter(
    (e) =>
      e.movement_category === 'Mobility' &&
      !exclude.has(e.id) &&
      equipmentSatisfied(e, available) &&
      (!focus.body_region || e.body_region === focus.body_region || e.body_region === 'Full Body')
  );
  // Prefer exact body_region matches over Full Body generic ones, but shuffle
  // within each tier (seeded by the workout) so the same body region doesn't
  // always surface the same handful of exercises in the same order.
  const exact = seededShuffle(candidates.filter((e) => e.body_region === focus.body_region), seed);
  const generic = seededShuffle(candidates.filter((e) => e.body_region !== focus.body_region), seed);
  return [...exact, ...generic].slice(0, count);
}

export function generateWarmup(
  prefs: WarmupPrefs,
  availableEquipment: string[],
  workout: WorkoutLike,
  exerciseCatalog: ExerciseRow[]
): WarmupResult {
  const duration = prefs.warmup_duration_minutes ?? 10;
  const available = new Set((availableEquipment || []).map((e) => e.trim()));
  const focus = deriveWorkoutFocus(workout, exerciseCatalog);

  const result: WarmupResult = {
    generated_at: new Date().toISOString(),
    duration_minutes: duration,
    mobility: [],
    cardio: null,
    first_movement: null,
    notes: prefs.warmup_notes || null,
  };

  // Budget minutes roughly across the three enabled sections.
  const sectionsEnabled = [prefs.warmup_include_mobility, prefs.warmup_include_cardio, prefs.warmup_include_first_movement].filter(Boolean).length || 1;
  const perSectionMinutes = Math.max(1, Math.floor(duration / sectionsEnabled));

  // --- Mobility ---
  if (prefs.warmup_include_mobility) {
    const maxItems = Math.max(2, Math.min(6, Math.round(perSectionMinutes / 1.5)));
    const seed = workout.id || workout.name || 'warmup';
    const saved = (prefs.warmup_mobility_exercises || [])
      .map((m) => exerciseCatalog.find((e) => e.id === m.exercise_id) || { id: m.exercise_id, name: m.exercise_name, equipment_tags: [] })
      .filter((e): e is ExerciseRow => !!e);
    const savedCompatible = saved.filter((e) => equipmentSatisfied(e, available));

    // Lead with picks tailored to *this* workout's body region so the warm up
    // actually varies day to day; only fall back to the athlete's saved
    // favorites to fill out any remaining slots (or when the catalog has
    // nothing relevant), instead of always opening with the fixed saved list.
    let mobilityPicks: ExerciseRow[] = pickMobilityFromCatalog(focus, exerciseCatalog, available, maxItems, new Set(), seed);
    if (mobilityPicks.length < maxItems) {
      const exclude = new Set(mobilityPicks.map((e) => e.id));
      const extra = savedCompatible.filter((e) => !exclude.has(e.id)).slice(0, maxItems - mobilityPicks.length);
      mobilityPicks = [...mobilityPicks, ...extra];
    }
    result.mobility = mobilityPicks.map((e) => ({
      exercise_id: e.id || null,
      exercise_name: e.name,
      detail: '1-2 sets x 10 reps (or 30 sec), controlled tempo',
    }));
  }

  // --- Cardio ---
  if (prefs.warmup_include_cardio) {
    const savedCardio = (prefs.warmup_cardio_options || []).filter((m) => CARDIO_MACHINES.includes(m) && available.has(m));
    const ownedCardio = CARDIO_MACHINES.filter((m) => available.has(m));
    const pool = savedCardio.length ? savedCardio : ownedCardio;
    if (pool.length) {
      const isConditioningFocused =
        focus.modality === 'Mixed Conditioning' ||
        focus.modality === 'Cyclical / Monostructural' ||
        focus.body_region === 'Full Body';
      const ranked = [...pool].sort(
        (a, b) => CARDIO_INTENSITY_ORDER.indexOf(a) - CARDIO_INTENSITY_ORDER.indexOf(b)
      );
      const machine = isConditioningFocused ? ranked[0] : pool[0];
      result.cardio = {
        machine,
        duration_minutes: Math.max(2, Math.min(8, perSectionMinutes)),
        intensity: CARDIO_INTENSITY_CUE[machine] || 'easy, conversational pace (RPE 3-4/10)',
      };
    }
  }

  // --- First movement prep ---
  if (prefs.warmup_include_first_movement) {
    const pattern = focus.movement_pattern;
    let candidate: ExerciseRow | undefined;
    if (pattern) {
      candidate = exerciseCatalog
        .filter((e) => e.movement_pattern === pattern && equipmentSatisfied(e, available))
        .sort((a, b) => {
          // Prefer lighter/simpler variants: bodyweight/no-equipment first.
          const aLoad = (a.equipment_tags || []).length;
          const bLoad = (b.equipment_tags || []).length;
          return aLoad - bLoad;
        })[0];
    }
    if (!candidate && focus.resolvedExercises.length) {
      // No pattern-mate found — fall back to the workout's own first exercise
      // (still useful as a "rehearse the movement" prep item).
      candidate = focus.resolvedExercises[0];
    }
    if (candidate) {
      const sets = prefs.warmup_first_movement_sets ?? 2;
      result.first_movement = {
        exercise_id: candidate.id || null,
        exercise_name: candidate.name,
        sets,
        detail: `${sets} light sets x 8-10 reps, well below working weight`,
      };
    }
  }

  return result;
}
