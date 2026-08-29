-- Prevent duplicate taxonomy terms, exercises, and workouts (case/whitespace-insensitive).
create unique index if not exists taxonomy_terms_dimension_norm_value_key
  on taxonomy_terms (dimension, lower(trim(value)));

create unique index if not exists exercises_norm_name_key
  on exercises (lower(trim(name)));

create unique index if not exists workouts_norm_name_key
  on workouts (lower(trim(name)));
