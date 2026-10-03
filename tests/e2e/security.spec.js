import { test, expect } from '@playwright/test';
import { FREE } from './fixtures/auth';
import { makeApiClient } from './fixtures/apiClient';

// Privilege-escalation regressions (2026-10-03 audit): a plain signed-in user must not
// be able to promote themselves to admin or publish their own workouts. Guarded by the
// profiles_guard_role / workouts_guard_status triggers (migration 20261003160000).

let apiPromise;
function api() {
  apiPromise ??= (async () => {
    const client = makeApiClient();
    const { error } = await client.auth.signInWithPassword(FREE);
    if (error) throw new Error(`sign-in failed for ${FREE.email}: ${error.message}`);
    return client;
  })();
  return apiPromise;
}

test.describe('Privilege escalation guards', () => {
  test('a user cannot promote themselves to admin via profiles.role', async () => {
    const client = await api();
    const { data: { user } } = await client.auth.getUser();

    // The update may be rejected or silently ignored — either way the role must not change.
    await client.from('profiles').update({ role: 'admin' }).eq('id', user.id);

    const { data: profile } = await client.from('profiles').select('role').eq('id', user.id).single();
    expect(profile.role).toBe('athlete');
    const { data: isAdmin } = await client.rpc('is_admin');
    expect(isAdmin).toBe(false);
  });

  test('a user cannot publish their own workout by setting status=approved', async () => {
    const client = await api();
    const { data: { user } } = await client.auth.getUser();
    const workoutId = `WK-SEC-${Date.now()}`;

    try {
      const { data: created, error } = await client.from('workouts').insert({
        workout_id: workoutId,
        name: 'Security test workout',
        ownership_type: 'personal',
        status: 'approved',
        owner_id: user.id,
        author_id: user.id,
      }).select('id, status').single();
      expect(error).toBeNull();
      expect(created.status).toBe('pending');

      await client.from('workouts').update({ status: 'approved' }).eq('id', created.id);
      const { data: after } = await client.from('workouts').select('status').eq('id', created.id).single();
      expect(after.status).toBe('pending');
    } finally {
      await client.from('workouts').delete().eq('workout_id', workoutId);
    }
  });

  test('social credentials are not readable through the API', async () => {
    const client = await api();
    const { data } = await client.from('social_credentials').select('*');
    expect(data ?? []).toHaveLength(0);

    const anon = makeApiClient();
    const { data: anonData } = await anon.from('social_credentials').select('*');
    expect(anonData ?? []).toHaveLength(0);
  });
});
