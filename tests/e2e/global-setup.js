// Signs in the seeded ATHLETE and ADMIN accounts once per e2e run and caches their
// sessions to disk. fixtures/auth.js's login() injects the cached session directly
// into localStorage instead of driving the /login form per test, so a run with N
// specs makes 2 real Supabase sign-ins instead of N.
import fs from 'node:fs';
import path from 'node:path';
import { createClient } from '@supabase/supabase-js';
import { ATHLETE, ADMIN, AUTH_DIR } from './fixtures/auth.js';

function loadEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) {
      process.env[match[1].trim()] = match[2].trim();
    }
  }
}

async function saveSession(user, filename) {
  const client = createClient(process.env.VITE_SUPABASE_URL, process.env.VITE_SUPABASE_ANON_KEY);
  const { data, error } = await client.auth.signInWithPassword(user);
  if (error) throw new Error(`global-setup: failed to sign in as ${user.email}: ${error.message}`);
  fs.mkdirSync(AUTH_DIR, { recursive: true });
  fs.writeFileSync(path.join(AUTH_DIR, filename), JSON.stringify(data.session));
}

export default async function globalSetup() {
  loadEnvLocal();
  await saveSession(ATHLETE, 'athlete.json');
  await saveSession(ADMIN, 'admin.json');
}
