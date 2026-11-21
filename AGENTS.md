# AGENTS.md

## Project Context

This is a React/Vite app backed by Supabase (auth + database), hosted on Cloudflare Pages and deployed from GitHub. Treat it as user-owned application code, keep changes focused on the user's request, and preserve existing project conventions.

Start with `README.md` for local setup and environment variables.

## Key Files

- `src/`: frontend application source.
- `src/lib/supabaseClient.js`: Supabase client.
- `src/lib/AuthContext.jsx`: auth state and session handling.
- `.env.local`: local-only environment values; never commit secrets.

## Working Notes

- Use `npm run dev` for local development.
- Run the relevant checks from `package.json` (`lint`, `typecheck`, `test:e2e`) before finishing code changes.
- Deploys happen automatically via Cloudflare Pages on push to the connected GitHub branch.

## Feature registry (Instagram content)

- `scripts/social/lib/features.mjs` lists every user-facing feature, with its facts, a relatable moment and things not to claim. Posts showcase what features do and never mention free vs Premium; the `tier` field is internal bookkeeping only. The weekly Instagram writer sources feature-spotlight posts from it and may only claim what it says.
- Whenever you build, change, remove or re-tier a user-facing feature (including changes to `src/lib/entitlements.js`, `src/components/UpgradeSheet.jsx` or the `free_ai_actions_per_month` setting), add or update its entry in `features.mjs` in the same change. Mention the registry update in the PR description.

## Instagram stories

Each published post gets a same-day Story teaser: `scripts/social/render_stories.py` renders a 9:16 image from the post's hook (stored in `social_posts.story_asset_url`), and `publish-due.mjs` posts it right after the post goes live. Set the repo variable `INSTAGRAM_STORIES` to `off` to disable it. A story failure never fails the publish run; it is recorded in `story_error`. Requires the `20261121120000_social_stories.sql` migration.
