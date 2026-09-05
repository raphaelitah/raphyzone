# Raphyzone

A React/Vite app backed by Supabase, hosted on Cloudflare Pages and deployed from GitHub.

## Prerequisites

1. Clone the repository.
2. Navigate to the project directory.
3. Install dependencies: `npm install`.
4. Create `.env.local` in the project root with your Supabase project values:

```bash
VITE_SUPABASE_URL=your_supabase_project_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key
```

## Run Locally

```bash
npm run dev
```

Open the local URL printed by Vite.

## Build

```bash
npm run build
```

## Deploy

Push to the connected GitHub branch; Cloudflare Pages builds and deploys automatically.

## Coaching Quality Expert

`scripts/coaching-quality-audit.mjs` is a read-only content-quality audit over the workout
catalog and real athlete plan assignments — separate from the e2e suite, which checks that the
UI/DB *work*, not that a workout *makes sense*. It flags nonsensical prescriptions (zero/negative
reps, rest, or rounds), a repeated exercise back-to-back inside a rotating block, workouts
structured as several standalone single-exercise blocks that look like they should be one
rotating circuit, a declared duration that doesn't match what the block structure implies, and —
the main risk, since plan generation's equipment matching is LLM-prompt-instructed rather than
code-enforced — a real athlete assigned a workout that needs equipment they don't have. Findings
append to `reports/coaching-quality-log.md` each run.

Needs a service-role key (RLS otherwise hides other users' profiles/plans, which this audit reads
across every athlete):

```bash
SUPABASE_URL=your_supabase_project_url SUPABASE_SERVICE_ROLE_KEY=your_service_role_key npm run audit:coaching-quality
```

`scripts/coaching-quality-agent.mjs` is the live counterpart: it logs into the running app as a
dedicated seeded athlete (`qa-coach@raphyzone.dev`, see `scripts/seed-test-data.sql`) and actually
executes real catalog workouts through the UI — real "Start set" / "Done" taps, real rest
countdowns (verified to actually tick, not just skipped past), real weight/feedback/note entry on
every completion screen — then narrates a verdict per workout: whether it ran smoothly, whether
every rest transition felt natural, and whether the declared duration holds up against what the
prescribed sets and rest actually add up to (flagged when the estimate is off by both >25% and
>6 min). It only re-executes a workout that's new or has changed since its last review (tracked in
the `coaching_agent_reviews` table), so a nightly run rotates through the catalog rather than
re-checking everything every time. Needs a running app and the same service-role key:

```bash
npm run dev &
SUPABASE_URL=your_supabase_project_url SUPABASE_SERVICE_ROLE_KEY=your_service_role_key \
  npm run agent:coaching-quality -- 15   # batch size, defaults to 15
```

Note on coverage: circuit/EMOM/Tabata blocks run through a countdown-timer UI with no per-phase
control or weight-logging screen (unlike solo/superset blocks, which use a tap-through "Start
set → Done → Rest" flow the agent drives and verifies live) — those are executed via the
block-level Start/Skip and narrated structurally from the database prescription rather than
watched phase-by-phase.

Both write to `reports/coaching-quality-log.md` and run nightly via
`.github/workflows/coaching-quality.yml` (also triggerable manually) — add
`SUPABASE_SERVICE_ROLE_KEY` as a repo secret for that workflow to run (find it in the Supabase
dashboard under Project Settings → API; never commit it or put it in `.env.local`).
