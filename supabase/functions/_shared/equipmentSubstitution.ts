import { expandEquipmentEquivalents, requiredEquipment } from './warmupGenerator.ts';

// Kettlebell -> dumbbell counterpart substitution.
//
// Two flavours of "an athlete with Dumbbells but no Kettlebell can still do
// this kettlebell exercise" exist in the catalog:
//  * dumbbell_substitutable: the bell is only a loaded mass, so the SAME
//    exercise works with a dumbbell (goblet squat, rack carry, ...).
//  * dumbbell_equivalent_code: the movement depends on the bell (swing, clean,
//    snatch, ...), but the catalog has a separate dumbbell exercise for it
//    ("Russian Dumbbell Swing"). The athlete is given that row instead.
//
// The second flavour changes WHICH exercise is shown, so callers must swap
// the row, not just relax the equipment check. src/lib/equipmentSubstitution.js
// mirrors the owned-equipment rule for the client; keep the two in step (a
// parity test covers it).

export interface SubstitutableExercise {
  equipment_tags?: string[] | null;
  dumbbell_substitutable?: boolean | null;
  dumbbell_equivalent_code?: string | null;
}

// Lower-cased owned equipment, with 'Adjustable Dumbbells' implying 'Dumbbells'.
// Returns null for a full-gym athlete: everything is available, so nothing is
// ever substituted.
export function ownedEquipmentSet(profile: any): Set<string> | null {
  if (profile?.equipment_profile === 'full_gym') return null;
  const owned = [...(profile?.available_equipment || []), ...(profile?.custom_equipment || [])];
  return new Set([...expandEquipmentEquivalents(owned)].map((e) => e.toLowerCase().trim()));
}

// True when this athlete should be given the exercise's dumbbell counterpart:
// the exercise needs a Kettlebell, the athlete has Dumbbells and no Kettlebell,
// and a counterpart is mapped. Exercises already usable as-is with a dumbbell
// (dumbbell_substitutable) are left alone.
export function needsDumbbellEquivalent(exercise: SubstitutableExercise | null | undefined, owned: Set<string> | null): boolean {
  if (!owned || !exercise?.dumbbell_equivalent_code) return false;
  if (exercise.dumbbell_substitutable) return false;
  if (!requiredEquipment(exercise.equipment_tags).includes('Kettlebell')) return false;
  return !owned.has('kettlebell') && owned.has('dumbbells');
}

// The counterpart row to use for this athlete, or null to keep the exercise.
export function dumbbellEquivalentFor<T extends SubstitutableExercise>(
  exercise: SubstitutableExercise | null | undefined,
  byCode: Map<string, T>,
  owned: Set<string> | null
): T | null {
  if (!needsDumbbellEquivalent(exercise, owned)) return null;
  return byCode.get(exercise!.dumbbell_equivalent_code as string) ?? null;
}

// Required-equipment tokens for one exercise, in the format
// computeEquipmentByWorkoutId aggregates per workout: a '/' inside a token is
// an OR of alternatives, satisfied if the athlete owns any of them.
//  * dumbbell_substitutable Kettlebell -> 'Kettlebell/Dumbbells'.
//  * mapped Kettlebell exercise -> 'Kettlebell/Dumbbells' too, plus anything
//    the counterpart needs that the original does not (so a counterpart that
//    wants a pull-up bar is never offered to an athlete without one).
//  * a mapped exercise whose counterpart row is missing stays Kettlebell-only.
export function equipmentTokensFor(exercise: SubstitutableExercise | null | undefined, counterpart?: SubstitutableExercise | null): string[] {
  const own = requiredEquipment(exercise?.equipment_tags);
  const hasUsableCounterpart = !!exercise?.dumbbell_equivalent_code && !!counterpart;
  const kettlebellFlexible = own.includes('Kettlebell') && (!!exercise?.dumbbell_substitutable || hasUsableCounterpart);

  const tokens = own.map((tag) => (tag === 'Kettlebell' && kettlebellFlexible ? 'Kettlebell/Dumbbells' : tag));

  if (kettlebellFlexible && !exercise?.dumbbell_substitutable && counterpart) {
    for (const tag of requiredEquipment(counterpart.equipment_tags)) {
      if (tag === 'Dumbbells' || tag === 'Adjustable Dumbbells') continue;
      if (!own.includes(tag)) tokens.push(tag);
    }
  }
  return tokens;
}
