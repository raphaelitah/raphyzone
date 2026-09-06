import { supabase } from '@/lib/supabaseClient';

export function normalizeText(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Postgres unique_violation. Backstops the pre-checks below against races.
export const UNIQUE_VIOLATION = '23505';

export async function findDuplicateExercise(name) {
  const norm = normalizeText(name);
  if (!norm) return null;
  const { data } = await supabase.from('exercises').select('id, name').ilike('name', norm).limit(10);
  return (data || []).find(e => normalizeText(e.name) === norm) || null;
}

export async function findDuplicateWorkout(name) {
  const norm = normalizeText(name);
  if (!norm) return null;
  const { data } = await supabase.from('workouts').select('id, name').ilike('name', norm).limit(10);
  return (data || []).find(w => normalizeText(w.name) === norm) || null;
}

export async function findDuplicateTaxonomyTerm(dimension, value, excludeId) {
  const norm = normalizeText(value);
  if (!norm) return null;
  const { data } = await supabase
    .from('taxonomy_terms')
    .select('id, value')
    .eq('dimension', dimension)
    .ilike('value', norm)
    .limit(10);
  return (data || []).find(t => t.id !== excludeId && normalizeText(t.value) === norm) || null;
}

// Similarity threshold above which a new workout submission is flagged to the
// submitter and surfaced to admins during review.
export const WORKOUT_SIMILARITY_THRESHOLD = 0.3;

function jaccardSimilarity(setA, setB) {
  if (setA.size === 0 || setB.size === 0) return 0;
  let shared = 0;
  for (const item of setA) if (setB.has(item)) shared += 1;
  const unionSize = setA.size + setB.size - shared;
  return unionSize === 0 ? 0 : shared / unionSize;
}

// Keys a workout's exercises by exercise_id when available, falling back to
// the normalized raw title (covers legacy rows with no exercise_id link).
function exerciseKey(be) {
  return be.exercise_id ? `id:${be.exercise_id}` : `title:${normalizeText(be.exercise_title_raw)}`;
}

async function loadWorkoutExerciseSets(excludeWorkoutId) {
  const { data: workouts } = await supabase
    .from('workouts')
    .select('workout_id, name')
    .eq('status', 'approved')
    .neq('workout_id', excludeWorkoutId || '')
    .limit(1000);
  const relevant = workouts || [];
  if (relevant.length === 0) return [];

  const workoutIds = Array.from(new Set(relevant.map(w => w.workout_id)));
  const { data: blocks } = await supabase
    .from('workout_blocks')
    .select('block_id, workout_id')
    .in('workout_id', workoutIds)
    .limit(5000);
  const blockToWorkout = new Map();
  const blockIds = [];
  (blocks || []).forEach(b => {
    blockToWorkout.set(b.block_id, b.workout_id);
    blockIds.push(b.block_id);
  });

  const setsByWorkout = new Map();
  if (blockIds.length > 0) {
    const { data: blockExs } = await supabase
      .from('block_exercises')
      .select('block_id, step_type, exercise_id, exercise_title_raw')
      .eq('step_type', 'exercise')
      .in('block_id', blockIds)
      .limit(10000);

    (blockExs || []).forEach(be => {
      const workoutId = blockToWorkout.get(be.block_id);
      if (!workoutId) return;
      if (!setsByWorkout.has(workoutId)) setsByWorkout.set(workoutId, new Set());
      setsByWorkout.get(workoutId).add(exerciseKey(be));
    });
  }

  return relevant.map(w => ({ workout_id: w.workout_id, name: w.name, exerciseSet: setsByWorkout.get(w.workout_id) || new Set() }));
}

// Compares a candidate list of block_exercises against every approved
// workout's exercise composition and returns the closest matches, most
// similar first. Each match's score is a 0-1 Jaccard overlap.
/**
 * @param {any[]} candidateBlockExercises
 * @param {{ excludeWorkoutId?: string, limit?: number }} [options]
 */
export async function findSimilarWorkouts(candidateBlockExercises, { excludeWorkoutId, limit = 3 } = {}) {
  const candidateSet = new Set(
    (candidateBlockExercises || []).filter(be => be.step_type === 'exercise').map(exerciseKey)
  );
  if (candidateSet.size === 0) return [];

  const workoutExerciseSets = await loadWorkoutExerciseSets(excludeWorkoutId);
  const scored = workoutExerciseSets
    .map(w => ({
      workout_id: w.workout_id,
      name: w.name,
      score: jaccardSimilarity(candidateSet, w.exerciseSet),
      sharedCount: [...candidateSet].filter(k => w.exerciseSet.has(k)).length,
      totalCount: candidateSet.size,
    }))
    .filter(m => m.score > 0)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit);
}

export function describeSimilarity(match) {
  if (!match) return '';
  const pct = Math.round(match.score * 100);
  return `${pct}% similar to "${match.name}" (shares ${match.sharedCount} of ${match.totalCount} exercises).`;
}
