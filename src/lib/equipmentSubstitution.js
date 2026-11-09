// Client mirror of supabase/functions/_shared/equipmentSubstitution.ts.
//
// An athlete who owns Dumbbells but no Kettlebell is shown the dumbbell
// counterpart of a kettlebell swing/clean/snatch (exercises.dumbbell_equivalent_code)
// instead of an exercise they cannot do. The server applies the same rule when
// it filters the plan and assigns weights, so keep the two in step; the parity
// test in equipmentSubstitution.test.js covers it.

// 'Adjustable Dumbbells' implies 'Dumbbells' (mirrors EQUIPMENT_IMPLIES in warmupGenerator.ts).
const EQUIPMENT_IMPLIES = { 'Adjustable Dumbbells': ['Dumbbells'] };

/** Lower-cased owned equipment, or null for a full-gym athlete (nothing is ever substituted). */
export function ownedEquipmentSet(profile) {
  if (!profile || profile.equipment_profile === 'full_gym') return null;
  const owned = [...(profile.available_equipment || []), ...(profile.custom_equipment || [])]
    .map((e) => (e || '').trim());
  const set = new Set(owned);
  for (const item of owned) for (const implied of EQUIPMENT_IMPLIES[item] || []) set.add(implied);
  return new Set([...set].map((e) => e.toLowerCase()));
}

/** True when this athlete should get the exercise's mapped dumbbell counterpart. */
export function needsDumbbellEquivalent(exercise, owned) {
  if (!owned || !exercise?.dumbbell_equivalent_code) return false;
  if (exercise.dumbbell_substitutable) return false;
  const tags = (exercise.equipment_tags || []).filter((t) => t !== 'Bodyweight');
  if (!tags.includes('Kettlebell')) return false;
  return !owned.has('kettlebell') && owned.has('dumbbells');
}

/**
 * Returns the workout list entry with its dumbbell counterpart swapped in, or
 * the entry untouched. Same shape as an on-the-spot swap in WorkoutExecution
 * (swapOrigin = the original key, so a later manual swap and a reload both
 * resolve against the saved workout), plus substitutedFrom for the UI.
 */
export function withDumbbellEquivalent(entry, owned, counterpartByCode, index) {
  if (!needsDumbbellEquivalent(entry?.details, owned)) return entry;
  const counterpart = counterpartByCode?.get(entry.details.dumbbell_equivalent_code);
  if (!counterpart) return entry;
  return {
    ...entry,
    swapOrigin: entry.key,
    substitutedFrom: entry.exercise_name,
    exercise_id: counterpart.exercise_code,
    exercise_name: counterpart.name,
    details: counterpart,
    key: `${counterpart.exercise_code}-sub-${index}`,
  };
}

/** Codes of the counterparts that must be fetched to substitute within this list of exercise rows. */
export function counterpartCodesNeeded(exerciseRows, owned) {
  return [...new Set(
    (exerciseRows || []).filter((e) => needsDumbbellEquivalent(e, owned)).map((e) => e.dumbbell_equivalent_code)
  )];
}
