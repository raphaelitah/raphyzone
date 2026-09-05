// Strips common equipment/modifier words so "Dumbbell Strict Press", "Barbell Strict
// Press", and plain "Strict Press" all normalize to the same core movement — used to
// catch the same exercise appearing back-to-back across a workout even when it's
// authored as separate block_exercises rows with different equipment prefixes.
// Shared by coaching-quality-audit.mjs (static, catalog-wide) and
// coaching-quality-agent.mjs (live, read off the screen during execution).
const EQUIPMENT_WORDS = new Set(['dumbbell', 'dumbbells', 'barbell', 'kettlebell', 'kettlebells', 'cable', 'machine', 'band', 'bands', 'smith', 'plate', 'bodyweight', 'bar', 'ez-bar', 'ez', 'trap']);

export function coreMovementName(name) {
  return (name || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .split(/\s+/)
    .filter((w) => w && !EQUIPMENT_WORDS.has(w))
    .join(' ')
    .trim();
}
