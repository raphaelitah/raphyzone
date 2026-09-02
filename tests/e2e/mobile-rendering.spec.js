import { test, expect } from '@playwright/test';
import { login } from './fixtures/auth';

// This app is used almost exclusively on mobile. These checks run against the
// mobile-chrome / mobile-safari projects (see playwright.config.js) and catch
// the most common mobile-layout regressions: horizontal overflow (content
// wider than the viewport, forcing sideways scroll) and touch targets too
// small/close together to tap reliably. They don't replace visual review —
// just guard against the easy-to-introduce breakages.

const PAGES = [
  { name: 'Home', path: '/' },
  { name: 'Workouts', path: '/workouts' },
  { name: 'Progress', path: '/progress' },
  { name: 'Exercises', path: '/library' },
  { name: 'Profile', path: '/profile' },
];

async function horizontalOverflow(page) {
  return page.evaluate(() => {
    const docWidth = document.documentElement.clientWidth;
    const offenders = [];
    const scrollableAncestor = (el) => {
      for (let node = el; node; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.overflowX === 'auto' || style.overflowX === 'scroll') return true;
      }
      return false;
    };
    for (const el of document.querySelectorAll('body *')) {
      const rect = el.getBoundingClientRect();
      if (rect.right > docWidth + 1 && rect.width > 0 && rect.height > 0) {
        // Empty containers (e.g. an unpopulated toast viewport) aren't visible overflow.
        if (el.childElementCount === 0 && !el.textContent.trim()) continue;
        // Content inside an intentionally horizontally-scrollable row (e.g. filter chips).
        if (scrollableAncestor(el)) continue;
        offenders.push(`${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`);
      }
    }
    return offenders;
  });
}

test.describe('Mobile rendering (regression)', () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  for (const { name, path } of PAGES) {
    test(`${name} has no horizontal overflow at mobile width`, async ({ page }) => {
      await page.goto(path);
      await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
      await expect(page.locator('body')).not.toContainText(/unexpected error|something went wrong/i);
      const offenders = await horizontalOverflow(page);
      expect(offenders, `Elements wider than the viewport on ${name}: ${offenders.join(', ')}`).toEqual([]);
    });
  }

  test('bottom nav tap targets are large enough to tap on mobile', async ({ page }) => {
    await page.goto('/');
    const links = page.locator('nav a, nav button');
    await expect(links.first()).toBeVisible({ timeout: 10000 });
    const count = await links.count();
    expect(count).toBeGreaterThan(0);
    for (let i = 0; i < count; i++) {
      const box = await links.nth(i).boundingBox();
      if (!box) continue;
      // ~44px is the commonly cited minimum comfortable touch target size.
      expect(box.height, `nav item ${i} height`).toBeGreaterThanOrEqual(40);
    }
  });

  test('workout library detail sheet fits mobile viewport', async ({ page }) => {
    await page.goto('/workouts');
    const cards = page.locator('button:has(p.font-semibold)');
    await expect(cards.first()).toBeVisible({ timeout: 10000 });
    await cards.first().click();

    const sheet = page.getByRole('dialog');
    await expect(sheet).toBeVisible();
    const box = await sheet.boundingBox();
    const viewport = page.viewportSize();
    expect(box.width).toBeLessThanOrEqual(viewport.width + 1);
  });

  test('plan builder / home renders without clipped primary action', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('nav')).toBeVisible({ timeout: 10000 });
    // Sanity check the page settles and doesn't leave any element flowing off the
    // right edge of a narrow phone screen (a frequent cause of unreachable buttons).
    const offenders = await horizontalOverflow(page);
    expect(offenders).toEqual([]);
  });
});
