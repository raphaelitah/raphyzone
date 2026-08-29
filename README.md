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
