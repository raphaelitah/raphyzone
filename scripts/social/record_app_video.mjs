#!/usr/bin/env node
// Screen recording (390x844) of a workout's detail sheet in the live app's library: opens the
// sheet, then scrolls through it slowly. Same seeded demo athlete and read-only rules as
// record_app.mjs (it never starts the workout).
//
//   node scripts/social/record_app_video.mjs <workout name> <outDir> [baseUrl]
// Writes <outDir>/tour.webm
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { loadEnvLocal } from './lib/env.mjs';

loadEnvLocal();
const [workoutName, outDir, baseUrl = process.env.APP_URL || 'https://raphyzone.pages.dev'] = process.argv.slice(2);
if (!workoutName || !outDir) { console.error('usage: record_app_video.mjs <workout name> <outDir> [baseUrl]'); process.exit(1); }

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
const ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
const email = process.env.TEST_ATHLETE_EMAIL || 'test-athlete@raphyzone.dev';
const password = process.env.TEST_ATHLETE_PASSWORD || 'TestAthlete123!';

const supabase = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
const { data, error } = await supabase.auth.signInWithPassword({ email, password });
if (error) throw error;

fs.mkdirSync(outDir, { recursive: true });
const tmp = path.join(outDir, 'raw');
const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
  recordVideo: { dir: tmp, size: { width: 390, height: 844 } },
});
const storageKey = `sb-${new URL(SUPABASE_URL).hostname.split('.')[0]}-auth-token`;
await context.addInitScript(({ k, v }) => localStorage.setItem(k, v), { k: storageKey, v: JSON.stringify(data.session) });
const page = await context.newPage();
await page.goto(`${baseUrl}/workouts`, { waitUntil: 'networkidle' });
await page.getByPlaceholder('Search workouts…').fill(workoutName);
const card = page.getByText(workoutName, { exact: true }).first();
await card.waitFor({ timeout: 15000 });
await page.waitForTimeout(800);
await card.click();
const sheet = page.getByRole('dialog');
await sheet.waitFor({ timeout: 10000 });
await page.waitForTimeout(1500);
await page.evaluate(() => document.activeElement?.blur());
// scroll the sheet in small steps so the recording reads as a smooth swipe
for (let i = 0; i < 14; i++) {
  const moved = await sheet.evaluate((el) => {
    const box = [el, ...el.querySelectorAll('*')].find((n) => n.scrollHeight > n.clientHeight + 40 && /auto|scroll/.test(getComputedStyle(n).overflowY));
    if (!box) return false;
    const before = box.scrollTop;
    box.scrollBy({ top: box.clientHeight * 0.18, behavior: 'smooth' });
    return box.scrollHeight - box.clientHeight - before > 4;
  });
  await page.waitForTimeout(550);
  if (!moved) break;
}
await page.waitForTimeout(800);
const video = page.video();
await context.close(); // flushes the video file
await browser.close();
fs.renameSync(await video.path(), path.join(outDir, 'tour.webm'));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Recorded tour for ${workoutName}`);
