// The Saturday image rotates: a push/pull/legs split one week in four, and a single
// featured workout (a different theme each time) in the three weeks between.
import { isTrulyEquipmentFree } from './workouts.mjs';

const SPLIT_ANCHOR = '2026-11-30'; // a Monday that has a split; every 4th week from it has one too
const MAX_ROWS = 10; // what fits legibly on the image

export const THEMES = [
  { id: 'full_body', label: 'a full-body session', match: (w) => /full/i.test(`${w.split || ''} ${w.movement_focus || ''} ${w.body_region || ''}`) },
  { id: 'no_equipment', label: 'a session that needs no equipment', match: isTrulyEquipmentFree },
  { id: 'quick', label: 'a session for a short slot', match: (w) => w.minutes <= 20 },
];

export function saturdayPlan(weekStart) {
  const weeks = Math.round((Date.parse(`${weekStart}T00:00:00Z`) - Date.parse(`${SPLIT_ANCHOR}T00:00:00Z`)) / (7 * 86400000));
  const phase = ((weeks % 4) + 4) % 4;
  return phase === 0
    ? { slot: 6, day: 5, kind: 'single_split' }
    : { slot: 6, day: 5, kind: 'single_workout', theme: THEMES[phase - 1] };
}

// Anything not featured recently, at random. Unlike pickWorkout this ignores
// is_free: with so few free workouts, preferring them repeated the same ones weekly.
export function pickVaried(candidates, recentIds, rng = Math.random) {
  const fresh = candidates.filter((w) => !recentIds.has(w.workout_id));
  const from = fresh.length ? fresh : candidates;
  return from[Math.floor(rng() * from.length)] || null;
}

// Only workouts that can be shown in full: one block, a few exercises each with a
// name and an amount, and a real workout name.
export function featurable(w) {
  if (!w.minutes || !w.name || /^\d|\bwork\b.*\brest\b/i.test(w.name) || w.blocks.length !== 1) return false;
  const steps = w.blocks[0].steps.filter((s) => s.step_type !== 'rest');
  return steps.length >= 3 && steps.length <= MAX_ROWS && steps.every((s) => s.name && s.prescription_value);
}

const titleCase = (s) => s.replace(/(^|[\s/])\w/g, (c) => c.toUpperCase());

// The image text comes straight from the catalog facts, never from the model.
export function workoutSlide(facts) {
  const [block] = facts.blocks;
  const gear = facts.equipment.every((t) => t === 'bodyweight') ? 'No equipment' : titleCase(facts.equipment.filter((t) => t !== 'bodyweight').join(', '));
  const format = facts.format ? titleCase(String(facts.format).replace(/_/g, ' ')).replace(/Amrap/i, 'AMRAP').replace(/Emom/i, 'EMOM') : null;
  const meta = [`${Math.round(facts.minutes)} min`, format, block.rounds > 1 && format !== 'AMRAP' ? `${block.rounds} rounds` : null, gear].filter(Boolean).join(' · ');
  return { title: facts.name, body: [meta, ...block.items].join('\n') };
}
