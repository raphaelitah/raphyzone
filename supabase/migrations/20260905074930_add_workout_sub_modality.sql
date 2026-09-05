-- Running is a sub-modality of the broad "Cyclical / Monostructural" modality
-- (which also covers rowing, biking, jump rope, etc.) — add a column so
-- running workouts can be tagged and filtered/searched specifically, instead
-- of the "Running" filter matching every monostructural-cardio workout.
alter table workouts add column if not exists sub_modality text;

alter table taxonomy_terms drop constraint taxonomy_terms_dimension_check;
alter table taxonomy_terms add constraint taxonomy_terms_dimension_check
  check (dimension = ANY (ARRAY['equipment'::text, 'movement_category'::text, 'body_region'::text, 'movement_pattern'::text, 'modality'::text, 'sub_modality'::text, 'laterality'::text, 'compound_isolation'::text, 'muscle_group'::text, 'impact_level'::text, 'prescription_unit'::text, 'workout_format'::text]));

insert into taxonomy_terms (dimension, value)
select 'sub_modality', 'Running'
where not exists (
  select 1 from taxonomy_terms where dimension = 'sub_modality' and value = 'Running'
);

-- Backfill: only workouts that are actually running sessions, not every
-- monostructural-cardio workout (assault bike, rowing, jump rope, etc.)
update workouts
set sub_modality = 'Running'
where modality = 'Cyclical / Monostructural'
  and sub_modality is null
  and (name ilike '%run%' or equipment @> '["Treadmill"]'::jsonb);
