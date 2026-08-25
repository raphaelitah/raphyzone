# AI-driven Edge Functions — porting status

These five functions are ported from `base44/functions/` (Base44 Cloud Functions) to
Supabase Edge Functions. They are **not yet deployed or wired up to the frontend** —
see "What's left" below.

| Function | Calls an LLM? | Status |
|---|---|---|
| `generateWeeklyPlan` | yes (2 calls + verify), via Groq | code ported, `_shared/llm.ts` implemented |
| `swapWorkout` | yes (1 call + verify), via Groq | code ported, `_shared/llm.ts` implemented |
| `assignWorkoutWeights` | **no** — rewritten as a deterministic formula | code ported, ready to deploy/test now |
| `learnFromSessionFeedback` | **no** — rewritten as a deterministic threshold rule | code ported, ready to deploy/test now |
| `applySwap` | no | code ported, ready to deploy/test now |

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

1. **Set the Groq API key as a secret** (free tier — [console.groq.com](https://console.groq.com)):
   ```bash
   supabase secrets set GROQ_API_KEY=gsk_... --project-ref tdxcdvalriekeddahkev
   ```
2. **Deploy the functions** (via `supabase functions deploy <name>` or the
   `deploy_edge_function` MCP tool), each with `verify_jwt: true`.
3. **Repoint the frontend** — `src/pages/PlanBuilder.jsx`, `src/lib/weightRecalc.js`,
   `src/pages/Home.jsx`, `src/pages/Progress.jsx`, and `src/pages/WorkoutExecution.jsx`
   still call `base44.functions.invoke('generateWeeklyPlan', ...)` etc. Swap those for
   `supabase.functions.invoke('generateWeeklyPlan', { body: {...} })` (same idea, same
   response shape — `res.data.plan` etc. — since the ported functions return
   identical JSON to the originals).
4. **Test each function** against real data before removing the Base44 fallback —
   `generateWeeklyPlan` and `swapWorkout` are LLM-driven and worth checking output
   quality, not just that they don't error; the other three are deterministic and
   just need normal correctness testing.
5. `WorkoutExecution.jsx` also has one `base44.integrations.Core.InvokeLLM` call
   (exercise substitution) that isn't in this directory yet — same pattern, would
   become its own tiny Edge Function once you're ready.
6. **Watch Groq's free-tier rate limits** if daily active users grow — currently
   only `generateWeeklyPlan` (weekly, 2 calls) and `swapWorkout` (occasional, 1 call)
   hit the LLM at all, so headroom is generous, but check
   [console.groq.com](https://console.groq.com) limits if usage climbs.

## Auth model

Every function verifies the caller's Supabase JWT (`_shared/auth.ts`, the
equivalent of Base44's `base44.auth.me()`) then does all data access through a
service-role client (`_shared/supabaseAdmin.ts`, bypasses RLS — the equivalent of
`base44.asServiceRole.entities.*`). This mirrors the original Base44 functions'
auth model exactly.
