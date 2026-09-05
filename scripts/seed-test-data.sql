-- Seed test users for local/dev testing against Supabase.
--
-- Creates two pre-confirmed accounts that skip onboarding and calibration,
-- so you can jump straight into the app instead of going through
-- Register -> email OTP -> Onboarding -> StrengthCalibration every time.
--
-- Run against the Supabase project's SQL editor (or via the Supabase MCP
-- execute_sql tool). Requires pgcrypto (enabled by default on Supabase).
--
-- Safe to re-run: skips users that already exist by email.

do $$
declare
  admin_id uuid;
  athlete_id uuid;
  qa_coach_id uuid;
begin
  -- Admin test user
  if not exists (select 1 from auth.users where email = 'test-admin@raphyzone.dev') then
    admin_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, reauthentication_token,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', admin_id, 'authenticated', 'authenticated',
      'test-admin@raphyzone.dev', crypt('TestAdmin123!', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Admin"}',
      '', '', '', '', '', '',
      now(), now()
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    ) values (
      admin_id::text, admin_id,
      jsonb_build_object('sub', admin_id::text, 'email', 'test-admin@raphyzone.dev'),
      'email', now(), now(), now(), gen_random_uuid()
    );

    -- handle_new_user trigger creates the public.profiles row; promote to admin.
    update public.profiles set role = 'admin' where id = admin_id;

    insert into public.athlete_profiles (
      user_id, goal, experience_level, onboarded, calibrated,
      equipment_profile, available_equipment
    ) values (
      admin_id, 'general_fitness', 'intermediate', true, true,
      'full_gym', '["barbell","dumbbell","bodyweight","machine","cable","kettlebell","bands"]'::jsonb
    );
  end if;

  -- Regular athlete test user
  if not exists (select 1 from auth.users where email = 'test-athlete@raphyzone.dev') then
    athlete_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, reauthentication_token,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', athlete_id, 'authenticated', 'authenticated',
      'test-athlete@raphyzone.dev', crypt('TestAthlete123!', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"Test Athlete"}',
      '', '', '', '', '', '',
      now(), now()
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    ) values (
      athlete_id::text, athlete_id,
      jsonb_build_object('sub', athlete_id::text, 'email', 'test-athlete@raphyzone.dev'),
      'email', now(), now(), now(), gen_random_uuid()
    );

    insert into public.athlete_profiles (
      user_id, goal, experience_level, onboarded, calibrated,
      equipment_profile, available_equipment
    ) values (
      athlete_id, 'hypertrophy', 'intermediate', true, true,
      'full_gym', '["barbell","dumbbell","bodyweight","machine","cable","kettlebell","bands"]'::jsonb
    );
  end if;
  -- Coaching Quality Expert agent account
  --
  -- A dedicated, fully-onboarded and fully-calibrated athlete with a complete
  -- training profile so the coaching-quality agent (scripts/coaching-quality-agent.mjs)
  -- logs in and executes real catalog workouts the same way a real user would —
  -- weight-fillable sets, a resolvable warm-up — kept separate from test-athlete so
  -- its runs never collide with other specs' in-progress sessions.
  if not exists (select 1 from auth.users where email = 'qa-coach@raphyzone.dev') then
    qa_coach_id := gen_random_uuid();

    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      confirmation_token, recovery_token, email_change_token_new,
      email_change, email_change_token_current, reauthentication_token,
      created_at, updated_at
    ) values (
      '00000000-0000-0000-0000-000000000000', qa_coach_id, 'authenticated', 'authenticated',
      'qa-coach@raphyzone.dev', crypt('QaCoach123!', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}', '{"full_name":"QA Coach"}',
      '', '', '', '', '', '',
      now(), now()
    );

    insert into auth.identities (
      provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
    ) values (
      qa_coach_id::text, qa_coach_id,
      jsonb_build_object('sub', qa_coach_id::text, 'email', 'qa-coach@raphyzone.dev'),
      'email', now(), now(), now(), gen_random_uuid()
    );

    insert into public.athlete_profiles (
      user_id, goal, secondary_goal, experience_level, onboarded, calibrated, calibrated_date,
      equipment_profile, available_equipment, duration_mode, duration_min, duration_max,
      dislikes, training_history, weight_unit, auto_approve_plans,
      strength_calibration, strength_known
    ) values (
      qa_coach_id, 'hypertrophy', 'general_fitness', 'intermediate', true, true, now(),
      'full_gym', '["barbell","dumbbell","bodyweight","machine","cable","kettlebell","bands"]'::jsonb,
      'fixed', 45, 60,
      '[]'::jsonb, 'Trains consistently for 3+ years, no injuries.', 'kg', true,
      jsonb_build_array(
        jsonb_build_object('pattern', 'squat', 'exercise', 'Barbell Back Squat', 'weight_kg', 80),
        jsonb_build_object('pattern', 'hinge', 'exercise', 'Barbell Deadlift', 'weight_kg', 100),
        jsonb_build_object('pattern', 'push', 'exercise', 'Barbell Bench Press', 'weight_kg', 60),
        jsonb_build_object('pattern', 'pull', 'exercise', 'Pull-up', 'weight_kg', 0),
        jsonb_build_object('pattern', 'overhead_press', 'exercise', 'Barbell Overhead Press', 'weight_kg', 40)
      ),
      true
    );
  end if;
end $$;

-- Test credentials (for reference):
--   Admin:    test-admin@raphyzone.dev   / TestAdmin123!
--   Athlete:  test-athlete@raphyzone.dev / TestAthlete123!
--   QA Coach: qa-coach@raphyzone.dev     / QaCoach123!
