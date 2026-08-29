import { makeApiClient } from './apiClient';
import { ATHLETE, ADMIN } from './auth';

// Seeds a pending exercise submission as the athlete (matches exercises_insert_authenticated
// RLS: author_id = self, submission_status = 'pending'), for admin-review tests to act on.
export async function seedPendingExercise(namePrefix = 'E2E test exercise') {
  const api = makeApiClient();
  const { data: signInData, error } = await api.auth.signInWithPassword(ATHLETE);
  if (error) throw error;
  const name = `${namePrefix} ${Date.now()}`;
  const { data, error: insertError } = await api
    .from('exercises')
    .insert({ name, author_id: signInData.user.id, author_name: 'Test Athlete', submission_status: 'pending' })
    .select()
    .single();
  if (insertError) throw insertError;
  return data;
}

// Seeds a pending personal workout submission as the athlete, for admin-review tests.
export async function seedPendingWorkout(namePrefix = 'E2E test workout') {
  const api = makeApiClient();
  const { data: signInData, error } = await api.auth.signInWithPassword(ATHLETE);
  if (error) throw error;
  const name = `${namePrefix} ${Date.now()}`;
  const { data, error: insertError } = await api
    .from('workouts')
    .insert({ name, owner_id: signInData.user.id, author_id: signInData.user.id, author_name: 'Test Athlete', ownership_type: 'personal', status: 'pending' })
    .select()
    .single();
  if (insertError) throw insertError;
  return data;
}

// Deletes rows as admin (required by exercises_delete_admin / workouts_write_owner_or_admin RLS).
export async function cleanupReviewItem(table, id) {
  const api = makeApiClient();
  await api.auth.signInWithPassword(ADMIN);
  await api.from(table).delete().eq('id', id);
}
