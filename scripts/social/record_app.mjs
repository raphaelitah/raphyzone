#!/usr/bin/env node
// Captures sharp (2x) phone-sized stills of a workout's detail sheet in the live app's
// library, for the closing "app screen" scene of a reel. Signs in as the seeded demo
// athlete from scripts/seed-test-data.sql. Read-only: it searches and opens the detail
// sheet, and never starts the workout (starting would create a session row).
//
//   node scripts/social/record_app.mjs <workout name> <outDir> [baseUrl]
// Writes <outDir>/app-1.png ... app-N.png (390x844 CSS px at 2x).
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './lib/env.mjs';

loadEnvLocal();
const [workoutName, outDir, baseUrl = process.env.APP_URL || 'https://raphyzone.pages.dev'] = process.argv.slice(2);
if (!workoutName || !outDir) { console.error('usage: record_app.mjs <workout name> <outDir> [baseUrl]'); process.exit(1); }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const email = process.env.TEST_ATHLETE_EMAIL || 'test-athlete@raphyzone.dev';
const password = process.env.TEST_ATHLETE_PASSWORD || 'TestAthlete123!';

const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;

fs.mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
await context.addInitScript(({ k, v }) => localStorage.setItem(k, v), { k: storageKey, v: JSON.stringify(data.session) });
const page = await context.newPage();
await page.goto(`${baseUrl}/workouts`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('Search workouts…').fill(workoutName);
const card = page.getByText(workoutName, { exact: true }).first();
await card.waitFor({ timeout: 15000 });
await card.click();
const sheet = page.getByRole('dialog');
await sheet.waitFor({ timeout: 10000 });
await page.waitForTimeout(1800);
await page.evaluate(() => document.activeElement?.blur());

const shots = [];
for (let i = 0; i < 3; i++) {
  const file = path.join(outDir, `app-${i + 1}.png`);
  await page.screenshot({ path: file });
  shots.push(file);
  const scrolled = await sheet.evaluate((el) => {
    const box = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(n).overflowY));
    if (!box) return false;
    const before = box.scrollTop;
    box.scrollBy(0, box.clientHeight * 0.7);
    return box.scrollTop !== before;
  });
  await page.waitForTimeout(500);
  if (!scrolled) break;
}
await browser.close();
console.log(`Captured ${shots.length} still(s) for ${workoutName}`);
