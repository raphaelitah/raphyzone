import { supabase } from '@/lib/supabaseClient';

/**
 * Maps a raw workout_format string to a user-friendly display label.
 * Strength-based formats (strength_sets, superset) become "Bodybuilding"
 * — or "Calisthenics" when allBodyweight is true.
 * Mixed formats show both components joined by " + ".
 */
export function computeFormatLabel(workoutFormat, allBodyweight, workoutName) {
  if (!workoutFormat) return '';
  if (workoutName && /^run\b/i.test(workoutName.trim())) return 'Conditioning';

  const strengthLabel = allBodyweight ? 'Calisthenics' : 'Bodybuilding';

  const mapComponent = (component) => {
    switch (component) {
      case 'for_time': return 'For Time';
      case 'amrap': return 'AMRAP';
      case 'emom': return 'EMOM';
      case 'circuit': return 'Circuit';
      case 'strength_sets':
      case 'superset':
        return strengthLabel;
      default:
        return component.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    }
  };

  const mixedMatch = workoutFormat.match(/^mixed\s*\((.+)\)$/);
  if (mixedMatch) {
    const components = mixedMatch[1].split('+').map((s) => s.trim());
    return components.map(mapComponent).join(' + ');
  }

  return mapComponent(workoutFormat);
}

/**
 * Loads the workout's exercises from the DB, determines whether every
 * exercise is bodyweight (requires_load === false), computes the format
 * label, saves it to the workout record, and returns the label.
 */
export async function recomputeAndSaveFormatLabel(workout) {
  if (!workout) return '';

  const { data: blocks } = await supabase
    .from('workout_blocks')
    .select('*')
    .eq('workout_id', workout.workout_id);
  const blockIds = (blocks || []).map((b) => b.block_id);

  if (blockIds.length === 0) {
    const label = computeFormatLabel(workout.workout_format, false, workout.name);
    await supabase.from('workouts').update({ format_label: label }).eq('id', workout.id);
    return label;
  }

  const { data: blockExs } = await supabase
    .from('block_exercises')
    .select('*')
    .in('block_id', blockIds);
  const exerciseCodes = (blockExs || [])
    .filter((be) => be.step_type === 'exercise' && be.exercise_id)
    .map((be) => be.exercise_id);

  if (exerciseCodes.length === 0) {
    const label = computeFormatLabel(workout.workout_format, false, workout.name);
    await supabase.from('workouts').update({ format_label: label }).eq('id', workout.id);
    return label;
  }

  const { data: exercises } = await supabase
    .from('exercises')
    .select('*')
    .in('exercise_code', exerciseCodes);
  const allBodyweight = (exercises || []).length > 0 && exercises.every((e) => e.requires_load === false);
  const label = computeFormatLabel(workout.workout_format, allBodyweight, workout.name);
  await supabase.from('workouts').update({ format_label: label }).eq('id', workout.id);
  return label;
}