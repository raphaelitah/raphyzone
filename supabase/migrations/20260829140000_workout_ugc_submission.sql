-- Allow users to submit personal workouts for admin review, mirroring the
-- exercise UGC flow, with a duplicate-similarity score computed at submit time.

ALTER TABLE public.workouts
  ADD COLUMN IF NOT EXISTS author_id uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS author_name text,
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS similarity_score numeric,
  ADD COLUMN IF NOT EXISTS similarity_note text;

ALTER TABLE public.workouts DROP CONSTRAINT IF EXISTS workouts_status_check;
ALTER TABLE public.workouts ADD CONSTRAINT workouts_status_check
  CHECK (status = ANY (ARRAY['approved'::text, 'pending'::text, 'archived'::text, 'rejected'::text]));

ALTER TABLE public.notifications DROP CONSTRAINT IF EXISTS notifications_type_check;
ALTER TABLE public.notifications ADD CONSTRAINT notifications_type_check
  CHECK (type = ANY (ARRAY['exercise_submitted'::text, 'exercise_approved'::text, 'exercise_rejected'::text, 'workout_submitted'::text, 'workout_approved'::text, 'workout_rejected'::text]));

-- Workout structure tables are otherwise admin-write-only; let an owner
-- write their own workout's structure while it isn't yet approved.
CREATE POLICY workout_blocks_write_owner ON public.workout_blocks
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.workouts w
  WHERE w.workout_id = workout_blocks.workout_id AND w.owner_id = auth.uid() AND w.status <> 'approved'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workouts w
  WHERE w.workout_id = workout_blocks.workout_id AND w.owner_id = auth.uid() AND w.status <> 'approved'
));

CREATE POLICY block_exercises_write_owner ON public.block_exercises
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.workout_blocks b JOIN public.workouts w ON w.workout_id = b.workout_id
  WHERE b.block_id = block_exercises.block_id AND w.owner_id = auth.uid() AND w.status <> 'approved'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.workout_blocks b JOIN public.workouts w ON w.workout_id = b.workout_id
  WHERE b.block_id = block_exercises.block_id AND w.owner_id = auth.uid() AND w.status <> 'approved'
));

CREATE POLICY prescribed_sets_write_owner ON public.prescribed_sets
FOR ALL
USING (EXISTS (
  SELECT 1 FROM public.block_exercises be
  JOIN public.workout_blocks b ON b.block_id = be.block_id
  JOIN public.workouts w ON w.workout_id = b.workout_id
  WHERE be.block_exercise_id = prescribed_sets.block_exercise_id AND w.owner_id = auth.uid() AND w.status <> 'approved'
))
WITH CHECK (EXISTS (
  SELECT 1 FROM public.block_exercises be
  JOIN public.workout_blocks b ON b.block_id = be.block_id
  JOIN public.workouts w ON w.workout_id = b.workout_id
  WHERE be.block_exercise_id = prescribed_sets.block_exercise_id AND w.owner_id = auth.uid() AND w.status <> 'approved'
));
