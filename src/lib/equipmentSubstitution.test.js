import { describe, it, expect } from 'vitest';
import {
  ownedEquipmentSet,
  needsDumbbellEquivalent,
  withDumbbellEquivalent,
  counterpartCodesNeeded,
} from './equipmentSubstitution.js';
import {
  ownedEquipmentSet as serverOwnedEquipmentSet,
  needsDumbbellEquivalent as serverNeedsDumbbellEquivalent,
  dumbbellEquivalentFor,
  equipmentTokensFor,
} from '../../supabase/functions/_shared/equipmentSubstitution.ts';
import { computeEquipmentByWorkoutId, filterCatalogForSelection } from '../../supabase/functions/_shared/planContext.ts';

const KB_SWING = { exercise_code: 'EX00089', name: 'American Kettlebell Swing', equipment_tags: ['Kettlebell'], dumbbell_equivalent_code: 'EX00088' };
const DB_SWING = { exercise_code: 'EX00088', name: 'American Dumbbell Swing', equipment_tags: ['Dumbbells'] };
const KB_CLEAN = { exercise_code: 'EX01315', name: 'Kettlebell Clean + Press', equipment_tags: ['Barbell', 'Kettlebell'], dumbbell_equivalent_code: 'EX00735' };
const DB_CLEAN = { exercise_code: 'EX00735', name: 'Dumbbell Clean + Press', equipment_tags: ['Barbell', 'Dumbbells'] };
const KB_GOBLET = { exercise_code: 'EX00001', name: 'Kettlebell Goblet Squat', equipment_tags: ['Kettlebell'], dumbbell_substitutable: true };
const KB_UNMAPPED = { exercise_code: 'EX00002', name: 'Bottoms Up Kettlebell Press', equipment_tags: ['Kettlebell'] };

const profile = (items, extra = {}) => ({ equipment_profile: 'custom', available_equipment: items, custom_equipment: [], ...extra });

describe('ownedEquipmentSet', () => {
  it('is null for a full-gym athlete (nothing is substituted)', () => {
    expect(ownedEquipmentSet({ equipment_profile: 'full_gym', available_equipment: [] })).toBeNull();
    expect(ownedEquipmentSet(null)).toBeNull();
  });

  it('lower-cases, merges custom equipment, and lets Adjustable Dumbbells imply Dumbbells', () => {
    const set = ownedEquipmentSet({ equipment_profile: 'custom', available_equipment: ['Adjustable Dumbbells'], custom_equipment: ['Sandbag'] });
    expect(set.has('dumbbells')).toBe(true);
    expect(set.has('adjustable dumbbells')).toBe(true);
    expect(set.has('sandbag')).toBe(true);
  });
});

describe('needsDumbbellEquivalent', () => {
  const dbOnly = ownedEquipmentSet(profile(['Dumbbells']));

  it('applies to a mapped kettlebell exercise for a dumbbells-only athlete', () => {
    expect(needsDumbbellEquivalent(KB_SWING, dbOnly)).toBe(true);
  });
  it('does not apply when the athlete owns a kettlebell', () => {
    expect(needsDumbbellEquivalent(KB_SWING, ownedEquipmentSet(profile(['Dumbbells', 'Kettlebell'])))).toBe(false);
  });
  it('does not apply without dumbbells', () => {
    expect(needsDumbbellEquivalent(KB_SWING, ownedEquipmentSet(profile(['Barbell'])))).toBe(false);
  });
  it('does not apply to full gym', () => {
    expect(needsDumbbellEquivalent(KB_SWING, ownedEquipmentSet({ equipment_profile: 'full_gym' }))).toBe(false);
  });
  it('does not apply to unmapped or dumbbell_substitutable exercises', () => {
    expect(needsDumbbellEquivalent(KB_UNMAPPED, dbOnly)).toBe(false);
    expect(needsDumbbellEquivalent({ ...KB_GOBLET, dumbbell_equivalent_code: 'EX1' }, dbOnly)).toBe(false);
  });
  it('does not apply to a non-kettlebell exercise even if a code is set', () => {
    expect(needsDumbbellEquivalent({ equipment_tags: ['Barbell'], dumbbell_equivalent_code: 'EX1' }, dbOnly)).toBe(false);
  });
});

describe('client and server rules agree', () => {
  const profiles = [
    profile(['Dumbbells']),
    profile(['Adjustable Dumbbells']),
    profile(['Dumbbells', 'Kettlebell']),
    profile(['Kettlebell']),
    profile(['Barbell']),
    profile([], { custom_equipment: ['Dumbbells'] }),
    { equipment_profile: 'full_gym', available_equipment: [] },
  ];
  const exercises = [KB_SWING, KB_CLEAN, KB_GOBLET, KB_UNMAPPED, DB_SWING, { ...KB_SWING, dumbbell_equivalent_code: null }];

  it('gives identical answers for every profile x exercise', () => {
    for (const p of profiles) {
      for (const e of exercises) {
        expect(needsDumbbellEquivalent(e, ownedEquipmentSet(p))).toBe(serverNeedsDumbbellEquivalent(e, serverOwnedEquipmentSet(p)));
      }
    }
  });
});

describe('withDumbbellEquivalent', () => {
  const dbOnly = ownedEquipmentSet(profile(['Dumbbells']));
  const entry = { key: 'BE1', exercise_id: 'EX00089', exercise_name: 'American Kettlebell Swing', details: KB_SWING, order: 3 };
  const counterparts = new Map([[DB_SWING.exercise_code, DB_SWING]]);

  it('swaps in the counterpart in the shape of an on-the-spot swap', () => {
    const out = withDumbbellEquivalent(entry, dbOnly, counterparts, 2);
    expect(out).toMatchObject({
      swapOrigin: 'BE1',
      substitutedFrom: 'American Kettlebell Swing',
      exercise_id: 'EX00088',
      exercise_name: 'American Dumbbell Swing',
      key: 'EX00088-sub-2',
      order: 3,
    });
    expect(out.details).toBe(DB_SWING);
  });

  it('leaves the entry untouched when no substitution applies', () => {
    expect(withDumbbellEquivalent(entry, ownedEquipmentSet(profile(['Kettlebell'])), counterparts, 0)).toBe(entry);
    expect(withDumbbellEquivalent(entry, null, counterparts, 0)).toBe(entry);
  });

  it('leaves the entry untouched when the counterpart row cannot be found', () => {
    expect(withDumbbellEquivalent(entry, dbOnly, new Map(), 0)).toBe(entry);
  });
});

describe('counterpartCodesNeeded', () => {
  it('lists each needed counterpart once', () => {
    const dbOnly = ownedEquipmentSet(profile(['Dumbbells']));
    expect(counterpartCodesNeeded([KB_SWING, KB_SWING, KB_CLEAN, KB_UNMAPPED, KB_GOBLET], dbOnly)).toEqual(['EX00088', 'EX00735']);
    expect(counterpartCodesNeeded([KB_SWING], ownedEquipmentSet(profile(['Kettlebell'])))).toEqual([]);
  });
});

describe('dumbbellEquivalentFor (server)', () => {
  it('returns the counterpart row, or null', () => {
    const byCode = new Map([[DB_SWING.exercise_code, DB_SWING]]);
    expect(dumbbellEquivalentFor(KB_SWING, byCode, serverOwnedEquipmentSet(profile(['Dumbbells'])))).toBe(DB_SWING);
    expect(dumbbellEquivalentFor(KB_SWING, byCode, serverOwnedEquipmentSet(profile(['Kettlebell'])))).toBeNull();
    expect(dumbbellEquivalentFor(KB_SWING, new Map(), serverOwnedEquipmentSet(profile(['Dumbbells'])))).toBeNull();
  });
});

describe('equipmentTokensFor', () => {
  it('turns a mapped Kettlebell into an OR with Dumbbells and keeps shared tags', () => {
    expect(equipmentTokensFor(KB_SWING, DB_SWING)).toEqual(['Kettlebell/Dumbbells']);
    expect(equipmentTokensFor(KB_CLEAN, DB_CLEAN)).toEqual(['Barbell', 'Kettlebell/Dumbbells']);
  });

  it('adds equipment only the counterpart needs, so it is never offered without it', () => {
    const counterpart = { ...DB_SWING, equipment_tags: ['Dumbbells', 'Pull-up Bar'] };
    expect(equipmentTokensFor(KB_SWING, counterpart)).toEqual(['Kettlebell/Dumbbells', 'Pull-up Bar']);
  });

  it('keeps Kettlebell required when the counterpart row is missing', () => {
    expect(equipmentTokensFor(KB_SWING, null)).toEqual(['Kettlebell']);
  });

  it('keeps the existing dumbbell_substitutable behaviour', () => {
    expect(equipmentTokensFor(KB_GOBLET)).toEqual(['Kettlebell/Dumbbells']);
  });

  it('leaves unmapped kettlebell exercises Kettlebell-only', () => {
    expect(equipmentTokensFor(KB_UNMAPPED)).toEqual(['Kettlebell']);
  });
});

// Minimal stand-in for the Supabase query builder: select().in().eq() chains
// over in-memory tables and resolves to { data }.
function fakeSupabase(tables) {
  return {
    from(name) {
      let rows = tables[name] || [];
      const builder = {
        select() { return builder; },
        in(col, values) { rows = rows.filter((r) => values.includes(r[col])); return builder; },
        eq(col, value) { rows = rows.filter((r) => r[col] === value); return builder; },
        then(resolve) { return Promise.resolve({ data: rows }).then(resolve); },
      };
      return builder;
    },
  };
}

describe('plan filtering end to end', () => {
  const supabase = fakeSupabase({
    workout_blocks: [
      { block_id: 'B1', workout_id: 'W_SWING' },
      { block_id: 'B2', workout_id: 'W_CLEAN' },
      { block_id: 'B3', workout_id: 'W_BOTTOMS_UP' },
      { block_id: 'B4', workout_id: 'W_MIXED' },
    ],
    block_exercises: [
      { block_id: 'B1', exercise_id: 'EX00089', step_type: 'exercise' },
      { block_id: 'B2', exercise_id: 'EX01315', step_type: 'exercise' },
      { block_id: 'B3', exercise_id: 'EX00002', step_type: 'exercise' },
      { block_id: 'B4', exercise_id: 'EX00089', step_type: 'exercise' },
      { block_id: 'B4', exercise_id: 'EX00002', step_type: 'exercise' },
    ],
    exercises: [KB_SWING, DB_SWING, KB_CLEAN, DB_CLEAN, KB_UNMAPPED, KB_GOBLET],
  });
  const workouts = ['W_SWING', 'W_CLEAN', 'W_BOTTOMS_UP', 'W_MIXED'].map((id) => ({ workout_id: id, name: id }));
  const eligible = async (p) => {
    const byWorkout = await computeEquipmentByWorkoutId(supabase, workouts.map((w) => w.workout_id));
    return filterCatalogForSelection(workouts, p, [], true, byWorkout).map((w) => w.workout_id);
  };

  it('offers a swing workout to a dumbbells-only athlete', async () => {
    expect(await eligible(profile(['Dumbbells']))).toEqual(['W_SWING']);
  });

  it('still hides the clean workout while its dumbbell counterpart needs a barbell', async () => {
    expect(await eligible(profile(['Dumbbells']))).not.toContain('W_CLEAN');
    expect(await eligible(profile(['Dumbbells', 'Barbell']))).toEqual(['W_SWING', 'W_CLEAN']);
  });

  it('never offers a workout containing a handle-dependent exercise without a kettlebell', async () => {
    const ids = await eligible(profile(['Dumbbells', 'Barbell']));
    expect(ids).not.toContain('W_BOTTOMS_UP');
    expect(ids).not.toContain('W_MIXED');
  });

  it('is unchanged for a kettlebell owner and for full gym', async () => {
    expect(await eligible(profile(['Kettlebell']))).toEqual(['W_SWING', 'W_BOTTOMS_UP', 'W_MIXED']);
    expect(await eligible({ equipment_profile: 'full_gym' })).toEqual(['W_SWING', 'W_CLEAN', 'W_BOTTOMS_UP', 'W_MIXED']);
  });
});
