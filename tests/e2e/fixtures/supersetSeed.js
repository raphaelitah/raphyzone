import { makeApiClient } from './apiClient';
import { ATHLETE, ADMIN } from './auth';

// Seeds a personal workout consisting of a single superset block (1 round, no
// rest) with two exercises, so workout-execution tests can drive the
// "finishing the last block" flow deterministically instead of depending on
// findMultiExerciseWorkoutId's standalone-only catalog search (which
// deliberately excludes superset/EMOM/Tabata blocks). Blocks must be written
// while the workout's status is 'pending' — matches fixtures/tabataSeed.js's
// pattern for personal-workout inserts.
export async function seedSupersetWorkout() {
  const api = makeApiClient();
  const { data: signInData, error } = await api.auth.signInWithPassword(ATHLETE);
  if (error) throw error;
  const userId = signInData.user.id;

  // Clean up any orphan left by a crashed prior run — workouts has a unique
  // constraint on the normalized name, so an orphan would block every future insert.
  const { data: orphans } = await api.from('workouts').select('id, workout_id').eq('name', 'E2E Superset Finish Test').eq('owner_id', userId);
  for (const orphan of orphans || []) {
    const { data: staleBlocks } = await api.from('workout_blocks').select('block_id').eq('workout_id', orphan.workout_id);
    const staleBlockIds = (staleBlocks || []).map((b) => b.block_id);
    if (staleBlockIds.length) {
      await api.from('block_exercises').delete().in('block_id', staleBlockIds);
      await api.from('workout_blocks').delete().in('block_id', staleBlockIds);
    }
    await api.from('workout_sessions').delete().eq('workout_id', orphan.id);
    await api.from('workouts').delete().eq('id', orphan.id);
  }
  // Orphaned catalog exercises from crashed runs (admin-only delete).
  await api.auth.signInWithPassword(ADMIN);
  await api.from('exercises').delete().like('exercise_code', 'E2E-SS-%');
  await api.auth.signInWithPassword(ATHLETE);

  const stamp = Date.now();
  const workoutId = `E2E-SUPERSET-${stamp}`;
  const { data: workout, error: workoutError } = await api
    .from('workouts')
    .insert({
      workout_id: workoutId,
      name: 'E2E Superset Finish Test',
      ownership_type: 'personal',
      status: 'pending',
      owner_id: userId,
      author_id: userId,
      author_name: 'Test Athlete',
    })
    .select()
    .single();
  if (workoutError) throw workoutError;

  // exercise_sessions.exercise_id is NOT NULL, so saving the workout needs the
  // block exercises to reference real catalog rows. Seed two bodyweight exercises
  // (pending, authored by the athlete, per the exercises_insert_authenticated RLS);
  // the names shown in the UI still come from exercise_title_raw below.
  const exerciseCodes = [`E2E-SS-A-${stamp}`, `E2E-SS-B-${stamp}`];
  const { error: catalogError } = await api.from('exercises').insert(
    exerciseCodes.map((code, i) => ({
      exercise_code: code,
      name: `E2E superset catalog ${i === 0 ? 'A' : 'B'} ${stamp}`,
      requires_load: false,
      author_id: userId,
      author_name: 'Test Athlete',
      submission_status: 'pending',
    })),
  );
  if (catalogError) throw catalogError;

  const blockId = `${workoutId}-B1`;
  const { error: blockError } = await api.from('workout_blocks').insert({
    block_id: blockId,
    workout_id: workoutId,
    order_index: 1,
    block_label: 'A',
    block_type: 'superset',
    workout_format: 'superset',
    rounds: 1,
    rest_seconds: 0,
    rest_between_rounds_sec: 0,
  });
  if (blockError) throw blockError;

  const { error: exercisesError } = await api.from('block_exercises').insert([
    {
      block_exercise_id: `${blockId}-E1`,
      block_id: blockId,
      step_type: 'exercise',
      exercise_id: exerciseCodes[0],
      exercise_title_raw: 'E2E Superset Move A',
      order_in_block: 1,
      prescription_type: 'reps',
      prescription_value: '10',
    },
    {
      block_exercise_id: `${blockId}-E2`,
      block_id: blockId,
      step_type: 'exercise',
      exercise_id: exerciseCodes[1],
      exercise_title_raw: 'E2E Superset Move B',
      order_in_block: 2,
      prescription_type: 'reps',
      prescription_value: '10',
    },
  ]);
  if (exercisesError) throw exercisesError;

  return { workoutUuid: workout.id, workoutId, blockId, exerciseCodes };
}

export async function cleanupSupersetWorkout({ workoutUuid, blockId, exerciseCodes = [] }) {
  const api = makeApiClient();
  await api.auth.signInWithPassword(ATHLETE);
  await api.from('block_exercises').delete().eq('block_id', blockId);
  await api.from('workout_blocks').delete().eq('block_id', blockId);
  await api.from('workout_sessions').delete().eq('workout_id', workoutUuid);
  await api.from('workouts').delete().eq('id', workoutUuid);
  // Deleting catalog exercises is admin-only (exercises_delete_admin RLS).
  if (exerciseCodes.length) {
    await api.auth.signInWithPassword(ADMIN);
    await api.from('exercises').delete().in('exercise_code', exerciseCodes);
  }
}
