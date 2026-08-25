import { SECONDARY_GOAL_OPTIONS, TRAINING_HISTORY_OPTIONS, PROGRAM_DIFFICULTY_LEVELS, GOALS } from '@/lib/fitness';

function goalLabel(value) {
  return GOALS.find((g) => g.value === value)?.label || 'training';
}

export const PROFILE_GAPS = [
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
    question: (p, ctx) => `Want ${ctx?.activity} scheduled regularly in your plan?`,
    hint: () => "We'll add it to your weekly rotation automatically.",
    isMissing: (p, ctx) => !!ctx?.activity && !(p?.desired_activities || []).some((a) => a.toLowerCase() === ctx.activity.toLowerCase()),
    buildPatch: (value, p, ctx) => (value ? { desired_activities: [...(p?.desired_activities || []), ctx.activity] } : null),
  },
];
