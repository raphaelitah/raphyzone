import { supabase } from '@/lib/supabaseClient';

export const DIMENSIONS = [
  { value: 'equipment', label: 'Equipment' },
  { value: 'movement_category', label: 'Movement Category' },
  { value: 'body_region', label: 'Body Region' },
  { value: 'movement_pattern', label: 'Movement Pattern' },
  { value: 'modality', label: 'Modality' },
  { value: 'laterality', label: 'Laterality' },
  { value: 'compound_isolation', label: 'Compound / Isolation' },
  { value: 'muscle_group', label: 'Muscle Group' },
  { value: 'impact_level', label: 'Impact Level' },
  { value: 'prescription_unit', label: 'Prescription Unit' },
  { value: 'workout_format', label: 'Workout Format' },
];

const FIELD_MAP = {
  equipment: { type: 'comma', field: 'equipment' },
  movement_category: { type: 'direct', field: 'movement_category' },
  body_region: { type: 'direct', field: 'body_region' },
  movement_pattern: { type: 'direct', field: 'movement_pattern' },
  modality: { type: 'direct', field: 'modality' },
  laterality: { type: 'direct', field: 'laterality' },
  compound_isolation: { type: 'direct', field: 'compound_isolation' },
  muscle_group: { type: 'multi', fields: ['primary_muscle_group', 'secondary_muscle_group'] },
  impact_level: { type: 'direct', field: 'impact_level' },
  prescription_unit: { type: 'direct', field: 'default_prescription_unit' },
};

export async function fetchAllTaxonomy() {
  const { data } = await supabase.from('taxonomy_terms').select('*').order('sort_order').limit(500);
  const byDimension = {};
  (data || []).forEach(t => {
    if (!byDimension[t.dimension]) byDimension[t.dimension] = [];
    byDimension[t.dimension].push(t.value);
  });
  return byDimension;
}

export async function fetchTaxonomyTerms(dimension) {
  const { data } = await supabase
    .from('taxonomy_terms')
    .select('*')
    .eq('dimension', dimension)
    .order('sort_order')
    .limit(500);
  return data || [];
}

export async function checkUsage(dimension, term) {
  const config = FIELD_MAP[dimension];
  if (!config) return 0;
  if (config.type === 'comma') {
    const { data } = await supabase.from('exercises').select('equipment').limit(3000);
    return (data || []).filter(e => e.equipment && e.equipment.split(',').map(s => s.trim()).includes(term)).length;
  } else if (config.type === 'multi') {
    const { count } = await supabase
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .or(`${config.fields[0]}.eq.${term},${config.fields[1]}.eq.${term}`);
    return count || 0;
  } else {
    const { count } = await supabase
      .from('exercises')
      .select('id', { count: 'exact', head: true })
      .eq(config.field, term);
    return count || 0;
  }
}

export async function transferExercises(dimension, oldTerm, newTerm) {
  const config = FIELD_MAP[dimension];
  if (!config) return;
  if (config.type === 'comma') {
    const { data } = await supabase.from('exercises').select('id, equipment').limit(3000);
    const matching = (data || []).filter(e => e.equipment && e.equipment.split(',').map(s => s.trim()).includes(oldTerm));
    await Promise.all(matching.map(e => supabase
      .from('exercises')
      .update({ equipment: e.equipment.split(',').map(s => s.trim()).map(item => item === oldTerm ? newTerm : item).join(', ') })
      .eq('id', e.id)));
  } else if (config.type === 'multi') {
    await supabase.from('exercises').update({ [config.fields[0]]: newTerm }).eq(config.fields[0], oldTerm);
    await supabase.from('exercises').update({ [config.fields[1]]: newTerm }).eq(config.fields[1], oldTerm);
  } else {
    await supabase.from('exercises').update({ [config.field]: newTerm }).eq(config.field, oldTerm);
  }
}

// Workout Format helpers

export async function fetchWorkoutFormatLabels() {
  const terms = await fetchTaxonomyTerms('workout_format');
  const map = {};
  terms.forEach(t => {
    if (t.value) map[t.value] = t.label || t.value;
  });
  return map;
}

export function formatWorkoutFormat(rawFormat, labelMap = {}) {
  if (!rawFormat) return '';
  // Direct lookup (handles simple formats and pre-seeded compound terms)
  if (labelMap[rawFormat]) return labelMap[rawFormat];
  // Compound format: "mixed (amrap+strength_sets)"
  const mixedMatch = rawFormat.match(/^mixed\s*\((.+)\)$/);
  if (mixedMatch) {
    const components = mixedMatch[1].split('+').map(s => s.trim());
    const labels = components.map(c => labelMap[c] || c.replace(/_/g, ' '));
    return `Mixed (${labels.join(' + ')})`;
  }
  // Fallback: humanize underscores
  return rawFormat.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}
