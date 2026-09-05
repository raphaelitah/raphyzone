import fs from 'node:fs';
import path from 'node:path';

// Seeded via scripts/seed-test-data.sql. Override with TEST_*_EMAIL/PASSWORD env vars if needed.
export const ATHLETE = {
  email: process.env.TEST_ATHLETE_EMAIL || 'test-athlete@raphyzone.dev',
  password: process.env.TEST_ATHLETE_PASSWORD || 'TestAthlete123!',
};

export const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'test-admin@raphyzone.dev',
  password: process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!',
};

export const AUTH_DIR = path.resolve(process.cwd(), 'tests/e2e/.auth');

function projectRef(url) {
  return new URL(url).hostname.split('.')[0];
}

// global-setup.js signs ATHLETE/ADMIN in once per run and caches their sessions here.
// Injecting the cached session into localStorage before the app boots is equivalent to
// driving the /login form, but skips a real Supabase sign-in (and its network/rendering
// cost) on every single test.
export async function login(page, user = ATHLETE) {
  const file = path.join(AUTH_DIR, user === ADMIN ? 'admin.json' : 'athlete.json');
  const session = JSON.parse(fs.readFileSync(file, 'utf8'));
  const key = `sb-${projectRef(process.env.VITE_SUPABASE_URL)}-auth-token`;
  await page.addInitScript(({ storageKey, storageValue }) => {
    window.localStorage.setItem(storageKey, storageValue);
  }, { storageKey: key, storageValue: JSON.stringify(session) });
  await page.goto('/');
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}
