import { format, startOfWeek, addDays, isSameDay, parseISO, differenceInCalendarDays } from 'date-fns';

// Workouts/exercises don't have a dedicated "running" taxonomy value — the catalog
// (and the AI plan generator) key running/cycling/rowing off these shared values.
export const RUNNING_MODALITY = 'Cyclical / Monostructural';
export const RUNNING_MOVEMENT_PATTERN = 'Locomotion / Cardio';
export const isRunningWorkout = (workout) => workout?.modality === RUNNING_MODALITY;
export const isRunningExercise = (exercise) => exercise?.movement_pattern === RUNNING_MOVEMENT_PATTERN;

export const EQUIPMENT_GROUPS = [
  { label: 'Free Weights', items: ['Barbell', 'EZ Bar', 'Dumbbells', 'Adjustable Dumbbells', 'Kettlebell', 'Weight Plates'] },
  { label: 'Machines', items: ['Smith Machine', 'Leg Press', 'Hack Squat Machine', 'Cable Crossover', 'Lat Pulldown', 'Seated Cable Row', 'Chest Press Machine', 'Shoulder Press Machine', 'Leg Extension', 'Leg Curl', 'Pec Deck', 'Calf Raise', 'Hip Thrust', 'Back Extension', 'Assisted Pull-up'] },
  { label: 'Benches & Stations', items: ['Flat Bench', 'Incline Bench', 'Decline Bench', 'Squat Rack', 'Power Rack', 'Pull-up Bar', 'Dip Station'] },
  { label: 'Accessories', items: ['Resistance Bands', 'Suspension Trainer (TRX or similar)', 'Slam Ball', 'Sandbag', 'Jump Rope', 'Step Box', 'Foam Roller', 'Weight Vest', 'Cable'] },
  { label: 'Cardio', items: ['Treadmill', 'Rowing Machine', 'Assault Bike', 'Stationary Bike', 'Stairmaster', 'SkiErg'] },
];

export const EQUIPMENT_OPTIONS = EQUIPMENT_GROUPS.flatMap((g) => g.items);

export const WEIGHT_CATEGORIES = [
  { key: 'dumbbells', label: 'Dumbbells', kinds: ['none', 'fixed', 'adjustable', 'full'] },
  { key: 'barbell', label: 'Barbell', kinds: ['none', 'adjustable', 'full'] },
  { key: 'kettlebells', label: 'Kettlebells', kinds: ['none', 'fixed', 'adjustable', 'full'] },
];

export const WEIGHT_KIND_LABELS = {
  none: 'None',
  fixed: 'Fixed set',
  adjustable: 'Adjustable (up to max)',
  full: 'Full gym · any weight',
};

export const FIXED_WEIGHT_OPTIONS = [1, 2, 2.5, 5, 7.5, 10, 12.5, 15, 17.5, 20, 22.5, 25, 30, 32, 35, 40, 50, 60];

// Maps a weight category to the equipment items that trigger a max-weight question.
export const WEIGHT_CATEGORY_EQUIPMENT = {
  dumbbells: ['Dumbbells', 'Adjustable Dumbbells'],
  barbell: ['Barbell', 'EZ Bar', 'Weight Plates'],
  kettlebells: ['Kettlebell'],
};

export const WEIGHT_CATEGORY_LABELS = {
  dumbbells: 'Dumbbells',
  barbell: 'Barbell',
  kettlebells: 'Kettlebells',
};

export function defaultWeightSetup() {
  return {
    dumbbells: { kind: 'none', max_kg: null, weights: [] },
    barbell: { kind: 'none', max_kg: null, weights: [] },
    kettlebells: { kind: 'none', max_kg: null, weights: [] },
  };
}

export const GOALS = [
  { value: 'strength', label: 'Strength', desc: 'Move heavier weight over time' },
  { value: 'hypertrophy', label: 'Hypertrophy', desc: 'Build muscle size' },
  { value: 'general_fitness', label: 'General Fitness', desc: 'Look, feel and move better' },
];

export const SECONDARY_GOAL_OPTIONS = [{ value: 'none', label: 'None' }, ...GOALS];

export const BODY_FOCUS_OPTIONS = ['Balanced', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Glutes', 'Core'];

export const PERFORMANCE_FOCUS_OPTIONS = ['None', 'Upper Body Strength', 'Lower Body Strength', 'Pull-ups', 'Bench Press', 'Squat', 'Deadlift'];

export const TRAINING_HISTORY_OPTIONS = [
  { value: 'new', label: 'New to training' },
  { value: 'inconsistent', label: 'Training inconsistently' },
  { value: 'under_1_year', label: 'Consistently for less than 1 year' },
  { value: '1_3_years', label: 'Consistently for 1–3 years' },
  { value: 'over_3_years', label: 'Consistently for more than 3 years' },
  { value: 'returning', label: 'Returning after a long break' },
];

export const PROGRAM_DIFFICULTY_LEVELS = [
  { value: 'recruit', label: 'Recruit', desc: 'Very forgiving progression, lower volume, longer recovery.' },
  { value: 'regular', label: 'Regular', desc: 'Balanced progression, suitable for most users.' },
  { value: 'challenger', label: 'Challenger', desc: 'Progressively push the athlete while remaining realistic.' },
  { value: 'elite', label: 'Elite', desc: 'Aggressive progression, higher intensity and workload.' },
  { value: 'beast', label: 'Apex', desc: 'Go hard or go home — HIIT and heavy.' },
];

export const EQUIPMENT_PROFILE_OPTIONS = [
  { value: 'full_gym', label: 'Full Gym', desc: 'Complete commercial gym — all equipment enabled automatically.' },
  { value: 'custom', label: 'Custom Equipment', desc: 'Select exactly what you have access to.' },
];

export const ALL_EQUIPMENT = EQUIPMENT_GROUPS.flatMap((g) => g.items);

export const CALIBRATION_PATTERNS = [
  { key: 'squat', title: 'Squat Pattern', question: 'What weight can you comfortably squat for around 8 repetitions?', options: ['Barbell Back Squat', 'Barbell Front Squat', 'DB / KB Goblet Squat', 'Leg Press', 'Other', "I don't perform this movement"] },
  { key: 'hinge', title: 'Hinge Pattern', question: 'What weight can you comfortably perform for around 8 repetitions?', options: ['Deadlift', 'Romanian Deadlift', 'Trap Bar Deadlift', 'Other', "I don't perform this movement"] },
  { key: 'horizontal_push', title: 'Horizontal Push', question: 'What do you normally press for around 8 repetitions?', options: ['Bench Press', 'Dumbbell Bench Press', 'Machine Chest Press', 'Push-ups', 'Other', "I don't perform this movement"] },
  { key: 'vertical_push', title: 'Vertical Push', question: 'What weight can you comfortably press overhead for around 8 repetitions?', options: ['Standing Overhead Press', 'Seated Dumbbell Press', 'Machine Shoulder Press', 'Other', "I don't perform this movement"] },
  { key: 'horizontal_pull', title: 'Horizontal Pull', question: 'What weight can you comfortably row for around 8 repetitions?', options: ['Barbell Row', 'Dumbbell Row', 'Cable Row', 'Machine Row', 'Other', "I don't perform this movement"] },
  { key: 'vertical_pull', title: 'Vertical Pull', question: 'What weight can you comfortably pull for around 8 repetitions?', options: ['Pull-ups', 'Assisted Pull-ups', 'Lat Pulldown', 'Other', "I don't perform this movement"] },
];

export const TRAINING_FOCUS_RANKS = [
  { value: 0, label: 'Pure Strength', desc: 'Lift only · muscle hypertrophy' },
  { value: 20, label: 'Strength', desc: 'Almost all lifting' },
  { value: 40, label: 'Strength +', desc: 'Mostly lifting, light conditioning' },
  { value: 50, label: 'Functional', desc: 'Balanced strength & cardio' },
  { value: 60, label: 'Conditioning', desc: 'More cardio, lift to support' },
  { value: 80, label: 'Cardio', desc: 'Mostly cardio' },
  { value: 100, label: 'Pure Cardio', desc: 'Endurance focus' },
];

export const TIME_OF_DAY_OPTIONS = [
  { value: 'morning', label: 'Morning' },
  { value: 'afternoon', label: 'Afternoon' },
  { value: 'evening', label: 'Evening' },
];

export const SPORT_ACTIVITIES = [
  'Badminton', 'Basketball', 'Boxing', 'Calisthenics', 'Climbing', 'CrossFit', 'Cycling',
  'Dance', 'Football', 'Gymnastics', 'HIIT', 'Hiking', 'Jiu-Jitsu', 'Jump Rope', 'Karate',
  'Kickboxing', 'MMA', 'Olympic Lifting', 'Padel', 'Pilates', 'Powerlifting', 'Rowing',
  'Rugby', 'Running', 'Skiing', 'Soccer', 'Spinning', 'Squash', 'Surfing', 'Swimming',
  'Taekwondo', 'Tennis', 'Triathlon', 'Volleyball', 'Yoga',
];

export const DESIRED_ACTIVITY_OPTIONS = [
  'Upper Body', 'Lower Body', 'Full Body',
  'Push', 'Pull', 'Legs',
  'Calisthenics', 'Running', 'HIIT',
  'Core', 'Mobility', 'Conditioning',
  'Powerlifting', 'Olympic Lifting', 'Bodybuilding',
  'CrossFit', 'Circuit Training', 'Plyometrics',
];

export const EXPERIENCE_LEVELS = [
  { value: 'beginner', label: 'Beginner', desc: 'Under 1 year of consistent training' },
  { value: 'intermediate', label: 'Intermediate', desc: '1–3 years of consistent training' },
  { value: 'advanced', label: 'Advanced', desc: '3+ years, familiar with periodization' },
];

export const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

export const DIFFICULTY_META = {
  easy: { label: 'Easy', color: 'text-emerald-600 bg-emerald-50' },
  normal: { label: 'Normal', color: 'text-sky-600 bg-sky-50' },
  hard: { label: 'Hard', color: 'text-amber-600 bg-amber-50' },
  failed: { label: 'Failed', color: 'text-rose-600 bg-rose-50' },
};

export const WORKOUT_DIFFICULTY_META = {
  beginner: { label: 'Beginner', color: 'text-emerald-600 bg-emerald-50' },
  intermediate: { label: 'Intermediate', color: 'text-sky-600 bg-sky-50' },
  advanced: { label: 'Advanced', color: 'text-rose-600 bg-rose-50' },
};

export const WORKOUT_CATEGORIES = ['Full Body', 'Upper Body', 'Lower Body', 'Conditioning', 'Core'];

export const WORKOUT_FORMATS = [
  { value: 'for_time', label: 'For Time' },
  { value: 'amrap', label: 'AMRAP' },
  { value: 'emom', label: 'EMOM' },
  { value: 'circuit', label: 'Circuit' },
  { value: 'strength_sets', label: 'Bodybuilding' },
  { value: 'superset', label: 'Bodybuilding' },
];

// Matches a workout's raw workout_format against a target format value,
// treating mixed(a+b+...) formats as matching if any component matches.
export function workoutFormatMatches(workoutFormat, targetValue) {
  if (!workoutFormat) return false;
  const mixedMatch = workoutFormat.match(/^mixed\s*\((.+)\)$/);
  if (mixedMatch) {
    return mixedMatch[1].split('+').map((s) => s.trim()).includes(targetValue);
  }
  return workoutFormat === targetValue;
}

export function mondayOf(date = new Date()) {
  return startOfWeek(date, { weekStartsOn: 1 });
}

export function nextMonday(date = new Date()) {
  return addDays(mondayOf(date), 7);
}

export function fmtDate(date, pattern = 'EEE d MMM') {
  return format(date, pattern);
}

export function fmtISO(date) {
  return format(date, 'yyyy-MM-dd');
}

export function parseDate(iso) {
  return parseISO(iso);
}

export function sameDay(a, b) {
  return isSameDay(a, b);
}

export function daysBetween(a, b) {
  return differenceInCalendarDays(a, b);
}

export function shortDay(iso) {
  return format(parseISO(iso), 'EEE');
}

export function badgeClass(meta, value) {
  return (meta[value]?.color) || 'text-muted-foreground bg-muted';
}

export function youtubeEmbedUrl(url) {
  if (!url) return null;
  try {
    const u = new URL(url);
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.slice(1);
      return id ? `https://www.youtube.com/embed/${id}` : url;
    }
    if (u.hostname.includes('youtube.com')) {
      const id = u.searchParams.get('v');
      if (id) return `https://www.youtube.com/embed/${id}`;
    }
    return url;
  } catch {
    return url;
  }
}