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
- After opening a pull request (local or remote session), enable GitHub auto-merge on it (squash) so it merges on its own once checks pass and required reviews are satisfied — matching local session behavior. Skip this only if the user explicitly asks for manual review/merge on that PR.
