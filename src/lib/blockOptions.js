// Canonical values for workout_blocks.block_type / workout_format. The
// execution logic in workoutStructure.js matches these strings exactly, so the
// editor offers them as dropdowns instead of free text.

export const BLOCK_TYPES = [
  { value: 'standalone', label: 'Standalone' },
  { value: 'superset', label: 'Superset' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'emom', label: 'EMOM' },
  { value: 'emom_alternating', label: 'EMOM (alternating)' },
  { value: 'tabata', label: 'Tabata' },
];

export const BLOCK_FORMATS = [
  { value: 'strength_sets', label: 'Strength sets' },
  { value: 'for_time', label: 'For time' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'superset', label: 'Superset' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'emom', label: 'EMOM' },
  { value: 'emom_alternating', label: 'EMOM (alternating)' },
  { value: 'tabata', label: 'Tabata' },
];
