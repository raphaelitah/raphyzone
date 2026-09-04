# E2E tests (Playwright)

Regression + common-action coverage against the real Supabase-backed app.

## Run

```bash
npm run test:e2e          # headless, mobile-chrome only (the app's primary use case)
npm run test:e2e:mobile   # mobile-chrome + mobile-safari
npm run test:e2e:desktop  # desktop chromium
npm run test:e2e:all      # every project
npm run test:e2e:ui       # interactive UI mode
```

`playwright.config.js` starts `npm run dev` automatically and points at `http://localhost:5173`.

This app is used almost exclusively on mobile, so `mobile-chrome` (Pixel 5 viewport) is the
default project run by `npm run test:e2e`, with `mobile-safari` (iPhone 13 viewport) and
desktop `chromium` available as additional projects. Running `test:e2e:all` triples the number
of real Supabase sign-ins per run — mind the password-auth rate limit noted below.

## Authenticated tests

Most flows (workouts, library, profile, admin) require a logged-in user, and log in against the
**real** Supabase project via the UI (no mocking). They use the seeded accounts from
[scripts/seed-test-data.sql](../../scripts/seed-test-data.sql):

- Athlete: `test-athlete@raphyzone.dev` / `TestAthlete123!` (default for `login(page)`)
- Admin: `test-admin@raphyzone.dev` / `TestAdmin123!` (`login(page, ADMIN)`)

Run `scripts/seed-test-data.sql` against the target Supabase project (SQL editor, or the Supabase
MCP `execute_sql` tool) before running the suite if those accounts don't exist yet — it's a no-op
if they're already there. Override credentials with `TEST_ATHLETE_EMAIL`/`TEST_ATHLETE_PASSWORD`
or `TEST_ADMIN_EMAIL`/`TEST_ADMIN_PASSWORD` env vars if needed.

## Layout

- `fixtures/auth.js` — shared login helper (`login(page)` / `login(page, ADMIN)`)
- `fixtures/apiClient.js` — direct Supabase client for test setup/teardown (bypasses the UI)
- `fixtures/reviewSeed.js` — seeds/cleans up pending exercise & workout submissions for
  admin-review tests
- `auth.spec.js` — login/logout, protected-route redirects
- `navigation.spec.js` — bottom-nav smoke test across all main tabs
- `library.spec.js` — exercise library: list, search, detail sheet
- `workouts.spec.js` — workout library: list, search, detail sheet with structure
- `workout-execution.spec.js` — starts a real workout, skips through every exercise, finishes
  it, and verifies the session is persisted as `completed` in Supabase
- `tabata-rest.spec.js` — seeds a two-block Tabata workout (via `fixtures/tabataSeed.js`) and
  verifies the inter-block rest countdown actually ticks through the block-complete log screen,
  overlays (rather than blocks) the next block's start panel, and prompts a confirm dialog when
  starting that block early instead of silently skipping the rest
- `plan-builder.spec.js` — generates a weekly plan end to end via the real
  `generateWeeklyPlan` LLM edge function (clears any existing plan for the current week first
  so it always exercises full generation; allow extra time, hence the 90s suite timeout)
- `plan-queue.spec.js` — fires two real `generateWeeklyPlan` calls at once (for next week and
  the week after, so it doesn't collide with `plan-builder.spec.js`'s current-week plan) to
  force one into the `plan_generation_jobs` queue, then polls `pollPlanJob` — the same way the
  frontend does — until it completes. Calls the edge functions directly rather than through the
  UI, since the queue's pacing guard is only reliably triggered by near-simultaneous requests
- `admin-taxonomy.spec.js` — non-admin redirect, add/edit/delete a taxonomy term
- `admin-review.spec.js` — non-admin redirect, approve/reject a seeded pending exercise or
  workout submission
- `mobile-rendering.spec.js` — checks every main page for horizontal overflow at mobile
  viewport width and confirms bottom-nav tap targets and sheet dialogs stay usable on a phone

Add one spec file per flow area as coverage grows.

## Note on parallelism

`playwright.config.js` pins `workers: 1`. Most specs sign in against the real Supabase
project, and running many sign-ins concurrently trips its password-auth rate limit, causing
flaky login timeouts — this isn't a bug in the app, just a constraint of testing against a
real (non-dedicated-test-tier) backend.
