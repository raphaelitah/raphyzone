import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';

// Renders the real sheet against a session shaped like a real one: a four-block
// workout where three exercises were added mid-session, some results were saved,
// and the athlete's run order puts the two added chest presses first.
const tables = {
  exercise_sessions: [
    { id: 'r0', workout_session_id: 's1', order_index: 0, exercise_id: 'EX_ROW', exercise_name: 'Bent Over Dumbbell Row', max_weight: 24, sets: 4, reps: '10', difficulty: 'normal' },
    { id: 'r1', workout_session_id: 's1', order_index: 1, exercise_id: 'EX_INCROW', exercise_name: 'Chest Supported Incline DB Row', max_weight: 24, sets: 3, reps: '12', difficulty: 'normal' },
    { id: 'r4', workout_session_id: 's1', order_index: 4, exercise_id: 'EX_BENCH', exercise_name: 'Barbell Bench Press', max_weight: 70, sets: 4, reps: '10', difficulty: 'normal' },
    { id: 'r5', workout_session_id: 's1', order_index: 5, exercise_id: 'EX_INCBENCH', exercise_name: 'Incline Barbell Bench Press', max_weight: 45, sets: 4, reps: '10', difficulty: 'normal' },
    { id: 'r6', workout_session_id: 's1', order_index: 6, exercise_id: 'EX_PLANK', exercise_name: 'Forearm Plank', sets: 3, reps: '60s', difficulty: 'normal' },
  ],
  workouts: [{ id: 'w-orig', workout_id: 'W1', name: 'Pull (Back + Biceps)' }, { id: 'w-saved', name: 'Pull (Back + Biceps) + Chest' }],
  workout_blocks: [
    { block_id: 'BLK0', workout_id: 'W1', order_index: 1, block_label: 'A', block_type: 'standalone', rounds: 4 },
    { block_id: 'BLK1', workout_id: 'W1', order_index: 2, block_label: 'B', block_type: 'standalone', rounds: 3 },
  ],
  block_exercises: [
    { block_exercise_id: 'BE0', block_id: 'BLK0', step_type: 'exercise', exercise_id: 'EX_ROW', exercise_title_raw: 'Bent Over Dumbbell Row', order_in_block: 1 },
    { block_exercise_id: 'BE1', block_id: 'BLK1', step_type: 'exercise', exercise_id: 'EX_INCROW', exercise_title_raw: 'Chest Supported Incline DB Row', order_in_block: 1 },
  ],
  exercises: [],
  workout_sessions: [],
};

const progress = {
  added: [
    { key: 'added-a', afterKey: 'BE0', sets: 4, reps: '10', exercise: { exercise_code: 'EX_BENCH', name: 'Barbell Bench Press' } },
    { key: 'added-b', afterKey: 'added-a', sets: 4, reps: '10', exercise: { exercise_code: 'EX_INCBENCH', name: 'Incline Barbell Bench Press' } },
    { key: 'added-c', afterKey: 'BE1', sets: 3, reps: '60s', exercise: { exercise_code: 'EX_PLANK', name: 'Forearm Plank' } },
  ],
  edits: {}, swaps: {},
  sequence: ['added:added-a', 'added:added-b', 'BLK0', 'BLK1', 'added:added-c'],
};

function builder(table) {
  const state = { filters: [] };
  const rows = () => {
    let r = tables[table] || [];
    state.filters.forEach(([kind, col, val]) => { r = r.filter((x) => (kind === 'in' ? val.includes(x[col]) : x[col] === val)); });
    return r;
  };
  const api = {
    select: () => api,
    order: () => api,
    limit: () => api,
    eq: (c, v) => { state.filters.push(['eq', c, v]); return api; },
    in: (c, v) => { state.filters.push(['in', c, v]); return api; },
    maybeSingle: () => {
      // The saved-as lookup reads the session's progress; give it one that was already saved.
      if (table === 'workout_sessions') return Promise.resolve({ data: { progress: { ...progress, savedAs: { id: 'w-saved', name: 'old' } } }, error: null });
      return Promise.resolve({ data: rows()[0] ?? null, error: null });
    },
    then: (res, rej) => Promise.resolve({ data: rows(), error: null }).then(res, rej),
  };
  return api;
}
vi.mock('@/lib/supabaseClient', () => ({ supabase: { from: (t) => builder(t), rpc: vi.fn() } }));
vi.mock('@/lib/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useEntitlement', () => ({ useEntitlement: () => ({ isPremium: true }) }));
vi.mock('recharts', () => ({}));

const { default: SessionDetailSheet } = await import('./SessionDetailSheet');

afterEach(cleanup);

describe('SessionDetailSheet', () => {
  const session = { id: 's1', user_id: 'u1', workout_id: 'w-orig', workout_name: 'Pull (Back + Biceps)', date: '2026-11-19', status: 'completed', progress };

  it('lists exercises in the order they were run, with added ones in place rather than under "Other"', async () => {
    render(<SessionDetailSheet session={session} open onOpenChange={() => {}} />);
    await screen.findByText('Barbell Bench Press');
    const names = ['Barbell Bench Press', 'Incline Barbell Bench Press', 'Bent Over Dumbbell Row', 'Chest Supported Incline DB Row', 'Forearm Plank'];
    const positions = names.map((n) => document.body.textContent.indexOf(n));
    expect(positions.every((p) => p >= 0)).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions); // already in the expected order
    expect(screen.queryByText('Other')).toBeNull();
  });

  it('says the session was saved, under the workout\'s current name, and does not offer to save it again', async () => {
    render(<SessionDetailSheet session={session} open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Saved as/)).not.toBeNull());
    expect(screen.getByText(/Pull \(Back \+ Biceps\) \+ Chest/)).not.toBeNull();
    expect(screen.queryByRole('button', { name: /save as custom workout/i })).toBeNull();
  });
});
