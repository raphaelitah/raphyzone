-- Backfill implement_count = 2 for bilateral dumbbell/kettlebell exercises that were
-- missed by the original hand-picked allowlist backfills (20260909180000, 20260909200001).
-- Those migrations only flipped implement_count for a small named list, leaving many
-- genuinely two-implement bilateral dumbbell movements (e.g. "Incline Dumbbell Bench
-- Press", "Dumbbell Lateral Raise") at the column default of 1 — which suppresses the
-- " each" qualifier on the active-workout weight tile (ExerciseSpecRow.jsx) even though
-- target_weight is a per-implement value.
--
-- Scope, to avoid mislabeling genuinely single-implement movements:
--  * Dumbbell + Bilateral: two dumbbells (one per hand) is the default convention for
--    plain "Dumbbell X" names. Excluded: names naming a single dumbbell held with both
--    hands ("Goblet", "Single Dumbbell", "Lopsided Single Dumbbell") — those stay at 1.
--  * Kettlebell + Bilateral: kettlebell work is predominantly single-implement (goblet,
--    swing, clean, deadlift, etc. done with one bell in two hands), so only exercises
--    explicitly named "Dual Kettlebell" / "Dual KB" are flipped to 2. Plain "Kettlebell X"
--    bilateral names are left untouched.
update public.exercises
set implement_count = 2
where implement_count = 1
  and laterality = 'Bilateral'
  and (
    (
      equipment ilike '%dumbbell%'
      and name not ilike '%goblet%'
      and name not ilike '%single dumbbell%'
    )
    or (
      equipment ilike '%kettlebell%'
      and (name ilike '%dual kettlebell%' or name ilike '%dual kb%')
    )
  );
