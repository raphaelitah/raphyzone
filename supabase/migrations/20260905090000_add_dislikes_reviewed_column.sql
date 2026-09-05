ALTER TABLE public.athlete_profiles ADD COLUMN IF NOT EXISTS dislikes_reviewed boolean NOT NULL DEFAULT false;
