import type { ExerciseRow } from './warmupGenerator.ts';

// Resolves a workout's actual exercise list from the current data model
// (workout_blocks + block_exercises, joined to the catalog via exercise_code)
// instead of the legacy workouts.exercises jsonb column. That column is a
// stale snapshot that isn't kept in sync when a workout's blocks are edited —
// see the "Pull Strength A" / "Push Strength A" coaching-quality findings,
// where deriveWorkoutFocus silently mis-derived the workout's dominant
// movement pattern because it was reading dead data instead of the real
// block structure.
export async function resolveWorkoutExercises(
  supabase: any,
  workoutBusinessId: string | null | undefined,
  exerciseCatalog: ExerciseRow[]
): Promise<ExerciseRow[]> {
  if (!workoutBusinessId) return [];
  const byCode = new Map((exerciseCatalog as any[]).map((e) => [e.exercise_code, e]));

  const { data: blocks } = await supabase
    .from('workout_blocks')
    .select('block_id, order_index')
    .eq('workout_id', workoutBusinessId);
  if (!blocks?.length) return [];

  const orderByBlock = new Map<string, number>(blocks.map((b: any) => [b.block_id, b.order_index]));
  const { data: steps } = await supabase
    .from('block_exercises')
    .select('block_id, exercise_id, order_in_block, step_type')
    .in('block_id', blocks.map((b: any) => b.block_id))
    .eq('step_type', 'exercise');

  return (steps || [])
    .sort((a: any, b: any) =>
      ((orderByBlock.get(a.block_id) ?? 0) - (orderByBlock.get(b.block_id) ?? 0)) || (a.order_in_block - b.order_in_block)
    )
    .map((s: any) => byCode.get(s.exercise_id))
    .filter((e: any): e is ExerciseRow => !!e);
}
