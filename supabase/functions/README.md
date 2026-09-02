# AI-driven Edge Functions — porting status

These six functions are ported from `base44/functions/` (Base44 Cloud Functions) to
Supabase Edge Functions, deployed, and fully wired up to the frontend — no page still
calls `base44.functions.invoke` or `base44.entities.*`. See "What's left" below for
the remaining housekeeping (secrets, quality testing).

| Function | Calls an LLM? | Status |
|---|---|---|
| `generateWeeklyPlan` | yes (2 calls + verify), via Groq | deployed, frontend repointed |
| `swapWorkout` | yes (1 call + verify), via Groq | deployed, frontend repointed |
| `assignWorkoutWeights` | **no** — rewritten as a deterministic formula | deployed, frontend repointed |
| `learnFromSessionFeedback` | **no** — rewritten as a deterministic threshold rule | deployed, frontend repointed |
| `applySwap` | no | deployed, frontend repointed |
| `suggestExerciseSubstitutes` | yes (1 call), via Groq | deployed, frontend repointed |
| `getWarmup` | no | deployed, frontend repointed |

`assignWorkoutWeights` and `learnFromSessionFeedback` originally called an LLM, but
their prompts were really spelling out a fixed formula/threshold (baseline × factors,
clamp; "2+ easy sessions → nudge up") — so they now run that logic directly in code
instead of a network round-trip, which is faster, free, and removes two of the four
LLM call sites.

`_shared/verifyWorkoutReasons.ts` (an LLM-calling helper the original codebase
exposed as its own Base44 function) is now an in-process helper called directly by
`generateWeeklyPlan` and `swapWorkout` — no extra HTTP round-trip needed, since
nothing else ever called it.

Three Base44 functions were **not** ported: `backfillExerciseStatus`,
`classifyWorkoutCatalog`, `reverifyPlanReasons`. They're admin one-off maintenance
scripts with no references anywhere in the frontend — nothing currently depends on
them. Port them later if you need them; they'd follow the exact same pattern as
the others.

## What's left

1. **Confirm the Groq API key secret is set** (free tier — [console.groq.com](https://console.groq.com)):
   ```bash
   supabase secrets set GROQ_API_KEY=gsk_... --project-ref tdxcdvalriekeddahkev
   ```
   (Already required for `generateWeeklyPlan`/`swapWorkout`, which are live — if
   those work, `suggestExerciseSubstitutes` will too.)
2. **Test each function** against real data — `generateWeeklyPlan`, `swapWorkout`,
   and `suggestExerciseSubstitutes` are LLM-driven and worth checking output quality,
   not just that they don't error; the other three are deterministic and just need
   normal correctness testing.
3. **Watch Groq's free-tier rate limits** if daily active users grow — this
   account's org caps every available model (120b, 20b, qwen3.6-27b — confirmed
   empirically) at a shared 8,000 tokens/minute on the "on_demand" tier, so a
   bigger catalog or more concurrent users can still hit it even after the cuts
   below. Check [console.groq.com](https://console.groq.com) if usage climbs.
   `generateWeeklyPlan`'s selection prompt (by far the largest — it embeds the
   workout catalog) is kept under budget by `_shared/planContext.ts`:
   `buildWorkoutCatalog` sends only the fields the RULES actually use (no
   `goal`/`split`/`difficulty`/`format` — `movement_focus` stays in, since the
   selection prompt has a rule telling the model to vary it across the week
   instead of repeating the same focus on every strength day), and
   `filterCatalogForSelection` drops equipment-incompatible workouts plus caps
   each modality at 20 candidates (a week only ever needs 7 unique picks, so
   this doesn't affect selection quality). If it still gets tight, cut
   `MAX_PER_MODALITY` in that file, or trim the boilerplate RULES text.
   `_shared/llm.ts`'s `callLLM` also retries up to 3 times with backoff on
   transient Groq failures (429 rate limits, 5xx, and the occasional
   400 where the model calls a hallucinated tool name instead of the forced
   `respond` tool) — auth/config errors (missing key, 401/403) are not retried.
4. **Decide on the three unported admin scripts** (`backfillExerciseStatus`,
   `classifyWorkoutCatalog`, `reverifyPlanReasons`) — still nothing in the frontend
   references them, so they can stay unported until actually needed.
5. Once everything above checks out, `src/api/base44Client.js` and the `base44/`
   directory are no longer imported anywhere in `src/` and can be removed.

## Auth model

Every function verifies the caller's Supabase JWT (`_shared/auth.ts`, the
equivalent of Base44's `base44.auth.me()`) then does all data access through a
service-role client (`_shared/supabaseAdmin.ts`, bypasses RLS — the equivalent of
`base44.asServiceRole.entities.*`). This mirrors the original Base44 functions'
auth model exactly.
