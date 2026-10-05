// Safety net for test data leaked by interrupted or crashed specs (their own
// afterEach/finally cleanup never ran). Sweeps everything the e2e seeds create,
// identified by their E2E- codes / "E2E " names, as ADMIN (exercise deletes are admin-only).
import { makeApiClient } from './fixtures/apiClient.js';
import { ADMIN } from './fixtures/auth.js';

export async function sweepE2EData() {
  const api = makeApiClient();
  const { error } = await api.auth.signInWithPassword(ADMIN);
  if (error) throw new Error(`global-teardown: failed to sign in as admin: ${error.message}`);

  const { data: workouts } = await api.from('workouts').select('id, workout_id').like('workout_id', 'E2E-%');
  for (const w of workouts || []) {
    const { data: blocks } = await api.from('workout_blocks').select('block_id').eq('workout_id', w.workout_id);
    const blockIds = (blocks || []).map((b) => b.block_id);
    if (blockIds.length) {
      await api.from('block_exercises').delete().in('block_id', blockIds);
      await api.from('workout_blocks').delete().in('block_id', blockIds);
    }
    await api.from('workout_sessions').delete().eq('workout_id', w.id);
    await api.from('workouts').delete().eq('id', w.id);
  }
  await api.from('exercises').delete().like('exercise_code', 'E2E-%');
  await api.from('exercises').delete().like('name', 'E2E %');
}

export default async function globalTeardown() {
  try {
    await sweepE2EData();
  } catch (e) {
    console.warn(`global-teardown: ${e.message}`);
  }
}
