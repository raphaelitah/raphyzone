import { SECONDARY_GOAL_OPTIONS, TRAINING_HISTORY_OPTIONS, PROGRAM_DIFFICULTY_LEVELS, GOALS } from '@/lib/fitness';

function goalLabel(value) {
  return GOALS.find((g) => g.value === value)?.label || 'training';
}

export const PROFILE_GAPS = [
  {
    key: 'strength_calibration',
    locations: ['home', 'library', 'progress', 'workout-search'],
    type: 'link',
    href: '/calibration',
    question: () => 'Calibrate your strength for accurate weights?',
    hint: () => "Takes a minute and dials in every plan's starting loads.",
    linkLabel: 'Calibrate now',
    isMissing: (p) => !p?.calibrated,
    buildPatch: () => null,
  },
  {
    key: 'session_duration',
    locations: ['library'],
    type: 'choice',
    question: () => 'How long do you usually want your sessions?',
    hint: () => "We'll surface workouts that fit your time.",
    options: [
      { label: '30 min', value: 30 },
      { label: '45 min', value: 45 },
      { label: '60 min', value: 60 },
      { label: '90 min', value: 90 },
    ],
    isMissing: (p) => !p?.duration_mode,
    buildPatch: (value) => ({ duration_mode: 'fixed', duration_min: value, duration_max: value }),
  },
  {
    key: 'dislikes',
    locations: ['library'],
    type: 'text',
    placeholder: 'e.g. Burpees, Overhead Press',
    question: () => "Any exercises you'd rather avoid?",
    hint: () => "We'll steer clear of them in your plans.",
    isMissing: (p) => !(p?.dislikes?.length),
    buildPatch: (value) => ({ dislikes: value.split(',').map((s) => s.trim()).filter(Boolean) }),
  },
  {
    key: 'secondary_goal',
    locations: ['home'],
    type: 'choice',
    question: (p) => `Got a secondary goal alongside ${goalLabel(p?.goal)}?`,
    hint: () => "We'll balance your plan around both.",
    options: (p) => SECONDARY_GOAL_OPTIONS.filter((g) => g.value !== 'none' && g.value !== p?.goal),
    isMissing: (p) => !p?.secondary_goal || p.secondary_goal === 'none',
    buildPatch: (value) => ({ secondary_goal: value }),
  },
  {
    key: 'training_history',
    locations: ['home'],
    type: 'choice',
    question: () => 'How would you describe your training history?',
    hint: () => 'Sharpens how fast we progress your programming.',
    options: TRAINING_HISTORY_OPTIONS,
    isMissing: (p) => !p?.training_history,
    buildPatch: (value) => ({ training_history: value }),
  },
  {
    key: 'weight_unit',
    locations: ['progress'],
    type: 'choice',
    question: () => 'Prefer kg or lb for weights?',
    hint: () => "We'll display every number in your unit.",
    options: [{ label: 'kg', value: 'kg' }, { label: 'lb', value: 'lb' }],
    isMissing: (p) => !p?.weight_unit,
    buildPatch: (value) => ({ weight_unit: value }),
  },
  {
    key: 'program_difficulty',
    locations: ['progress'],
    type: 'choice',
    question: () => 'How hard should we push your programming?',
    hint: () => 'Tunes progression pace and workload.',
    options: PROGRAM_DIFFICULTY_LEVELS,
    isMissing: (p) => !p?.program_difficulty,
    buildPatch: (value) => ({ program_difficulty: value }),
  },
  {
    key: 'desired_activity',
    locations: ['workout-search'],
    type: 'yesno',
    question: (p, ctx) => `Want ${ctx?.activity} scheduled regularly on ${ctx?.day}s?`,
    hint: () => "We'll add it to your weekly rotation automatically.",
    isMissing: (p, ctx) => !!ctx?.activity && !!ctx?.day
      && !(p?.desired_activities || []).some((a) => a.day === ctx.day && (a.activity || '').toLowerCase() === ctx.activity.toLowerCase()),
    buildPatch: (value, p, ctx) => (value ? { desired_activities: [...(p?.desired_activities || []), { day: ctx.day, activity: ctx.activity }] } : null),
  },
];

// Gaps usable outside their triggering location (no ctx required).
const COMPLETENESS_GAPS = PROFILE_GAPS.filter((g) => g.key !== 'desired_activity');

// Optional profile fields with no nudge prompt of their own but still worth counting toward completeness.
// resistance_priority/conditioning_priority/duration_min/duration_max/warmup_duration_minutes no longer carry
// DB defaults (see migration drop_stale_defaults_completeness_fields), so null here means genuinely untouched.
// warmup_include_* still carry DB defaults for plan-generation reasons (see planContext.ts), so warmup
// completion is inferred from notes/mobility picks instead of those flags.
const COMPLETENESS_EXTRA_FIELDS = [
  { key: 'body_focus', isMissing: (p) => !(p?.body_focus?.length) },
  { key: 'performance_focus', isMissing: (p) => !(p?.performance_focus?.length) },
  { key: 'training_days', isMissing: (p) => !(p?.training_days?.length) },
  { key: 'scheduled_activities', isMissing: (p) => !(p?.scheduled_activities?.length) },
  { key: 'desired_activities', isMissing: (p) => !(p?.desired_activities?.length) },
  {
    key: 'weight_setup',
    isMissing: (p) => !['dumbbells', 'barbell', 'kettlebells'].some((k) => p?.weight_setup?.[k]?.max_kg),
  },
  {
    key: 'training_mix',
    isMissing: (p) => p?.resistance_priority == null && p?.conditioning_priority == null,
  },
  {
    key: 'duration_range',
    isMissing: (p) => p?.duration_min == null && p?.duration_max == null,
  },
  {
    key: 'warmup_preferences',
    isMissing: (p) => p?.warmup_duration_minutes == null && !p?.warmup_notes && !(p?.warmup_mobility_exercises?.length),
  },
];

export function getProfileCompleteness(profile) {
  const total = COMPLETENESS_GAPS.length + COMPLETENESS_EXTRA_FIELDS.length;
  const missing = COMPLETENESS_GAPS.filter((g) => g.isMissing(profile)).length
    + COMPLETENESS_EXTRA_FIELDS.filter((g) => g.isMissing(profile)).length;
  return { done: total - missing, total };
}
