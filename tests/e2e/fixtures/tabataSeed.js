import { makeApiClient } from './apiClient';
import { ATHLETE } from './auth';

// Seeds a personal workout with two back-to-back Tabata blocks (1 round,
// 1s work, 1s internal rest — so each block finishes in ~11s including the
// fixed 10s lead-in) and a short `restBetweenBlocksSec` gap between them, so
// workout-execution tests can exercise the inter-block rest countdown
// without waiting through a real 40s+ Tabata. Blocks must be written while
// the workout's status is 'pending' (workout_blocks/block_exercises RLS
// requires status <> 'approved' for owner writes) — matches
// fixtures/reviewSeed.js's pattern for personal-workout inserts.
export async function seedTabataWorkout(restBetweenBlocksSec = 15) {
  const api = makeApiClient();
  const { data: signInData, error } = await api.auth.signInWithPassword(ATHLETE);
  if (error) throw error;
  const userId = signInData.user.id;

  const stamp = Date.now();
  const workoutId = `E2E-TABATA-${stamp}`;
  const { data: workout, error: workoutError } = await api
    .from('workouts')
    .insert({
      workout_id: workoutId,
      name: 'E2E Tabata Rest Test',
      ownership_type: 'personal',
      status: 'pending',
      owner_id: userId,
      author_id: userId,
      author_name: 'Test Athlete',
    })
    .select()
    .single();
  if (workoutError) throw workoutError;

  const blockIds = [`${workoutId}-B1`, `${workoutId}-B2`];
  const { error: blocksError } = await api.from('workout_blocks').insert(
    blockIds.map((block_id, i) => ({
      block_id,
      workout_id: workoutId,
      order_index: i + 1,
      block_label: String.fromCharCode(65 + i),
      block_type: 'tabata',
      workout_format: 'tabata',
      rounds: 1,
      work_seconds: 1,
      rest_seconds: 1,
      rest_between_rounds_sec: restBetweenBlocksSec,
    }))
  );
  if (blocksError) throw blocksError;

  const { error: exercisesError } = await api.from('block_exercises').insert(
    blockIds.map((block_id) => ({
      block_exercise_id: `${block_id}-E1`,
      block_id,
      step_type: 'exercise',
      exercise_id: null,
      exercise_title_raw: 'E2E Tabata Move',
      order_in_block: 1,
      prescription_type: 'time',
      prescription_value: '1s',
    }))
  );
  if (exercisesError) throw exercisesError;

  return { workoutUuid: workout.id, workoutId, blockIds };
}

export async function cleanupTabataWorkout({ workoutUuid, workoutId, blockIds }) {
  const api = makeApiClient();
  await api.auth.signInWithPassword(ATHLETE);
  await api.from('block_exercises').delete().in('block_id', blockIds);
  await api.from('workout_blocks').delete().in('block_id', blockIds);
  await api.from('workout_sessions').delete().eq('workout_id', workoutId);
  await api.from('workouts').delete().eq('id', workoutUuid);
}
