import { supabase } from '@/lib/supabaseClient';

export function normalizeText(value) {
  return (value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

// Postgres unique_violation. Backstops the pre-checks below against races.
export const UNIQUE_VIOLATION = '23505';

export async function findDuplicateExercise(name) {
  const norm = normalizeText(name);
  if (!norm) return null;
  const { data } = await supabase.from('exercises').select('id, name').limit(3000);
  return (data || []).find(e => normalizeText(e.name) === norm) || null;
}

export async function findDuplicateWorkout(name) {
  const norm = normalizeText(name);
  if (!norm) return null;
  const { data } = await supabase.from('workouts').select('id, name').limit(3000);
  return (data || []).find(w => normalizeText(w.name) === norm) || null;
}

export async function findDuplicateTaxonomyTerm(dimension, value, excludeId) {
  const norm = normalizeText(value);
  if (!norm) return null;
  const { data } = await supabase.from('taxonomy_terms').select('id, value').eq('dimension', dimension).limit(500);
  return (data || []).find(t => t.id !== excludeId && normalizeText(t.value) === norm) || null;
}
