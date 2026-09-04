import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

loadEnvLocal();

// A Supabase client for test setup/teardown (seeding, cleanup) that talks to the
// real backend directly, bypassing the UI. Sign in as one of the seeded test users
// before using it so RLS policies apply as that user.
export function makeApiClient() {
  return createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
}

// Monday of the current week as YYYY-MM-DD, matching src/lib/fitness.js mondayOf/fmtISO.
export function currentWeekStartISO() {
  const now = new Date();
  const day = now.getDay(); // 0 = Sunday
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday);
  return monday.toISOString().slice(0, 10);
}

// Finds an approved workout made up entirely of "standalone" blocks (no
// superset/circuit/EMOM block that requires an explicit "Start <block>" tap
// before its exercises can be skipped) with at least `minExercises` exercise
// steps, for specs that need to land mid-workout deterministically. Picking
// "the first card" in the library is order-dependent on the live catalog and
// can land on a single-exercise or block-timer workout, so specs asserting a
// specific mid-workout state should use this instead.
export async function findMultiExerciseWorkoutId(api, minExercises = 2) {
  const { data: blocks } = await api.from('workout_blocks').select('block_id, workout_id, block_type').limit(5000);
  const { data: blockExs } = await api.from('block_exercises').select('block_id, step_type').eq('step_type', 'exercise').limit(20000);
  const blockToWorkout = new Map((blocks || []).map((b) => [b.block_id, { workoutCode: b.workout_id, blockType: b.block_type }]));
  const exCounts = new Map();
  const nonStandaloneWorkouts = new Set();
  (blocks || []).forEach((b) => { if (b.block_type !== 'standalone') nonStandaloneWorkouts.add(b.workout_id); });
  (blockExs || []).forEach((be) => {
    const info = blockToWorkout.get(be.block_id);
    if (!info) return;
    exCounts.set(info.workoutCode, (exCounts.get(info.workoutCode) || 0) + 1);
  });
  const eligibleCodes = [...exCounts.entries()]
    .filter(([code, count]) => count >= minExercises && !nonStandaloneWorkouts.has(code))
    .map(([code]) => code)
    .sort();
  if (!eligibleCodes.length) throw new Error(`No approved standalone-only workout found with >= ${minExercises} exercises`);
  const { data: workouts } = await api.from('workouts').select('id, workout_id').eq('status', 'approved').in('workout_id', eligibleCodes.slice(0, 20));
  const match = (workouts || []).sort((a, b) => a.workout_id.localeCompare(b.workout_id))[0];
  if (!match) throw new Error('No approved workout matched the eligible candidates');
  return match.id;
}

// Adds `days` to a YYYY-MM-DD string, returning the same format. Used to derive
// distinct-but-real Monday dates (e.g. next week, the week after) for tests that
// need more than one week_start_date without colliding with the "current week"
// plan other specs exercise.
export function addDaysISO(iso, days) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
