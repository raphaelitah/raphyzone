// Seeded via scripts/seed-test-data.sql. Override with TEST_*_EMAIL/PASSWORD env vars if needed.
export const ATHLETE = {
  email: process.env.TEST_ATHLETE_EMAIL || 'test-athlete@raphyzone.dev',
  password: process.env.TEST_ATHLETE_PASSWORD || 'TestAthlete123!',
};

export const ADMIN = {
  email: process.env.TEST_ADMIN_EMAIL || 'test-admin@raphyzone.dev',
  password: process.env.TEST_ADMIN_PASSWORD || 'TestAdmin123!',
};

export async function login(page, user = ATHLETE) {
  await page.goto('/login');
  await page.getByLabel(/email/i).fill(user.email);
  await page.getByLabel(/password/i).fill(user.password);
  await page.getByRole('button', { name: /log in/i }).click();
  await page.waitForURL((url) => !url.pathname.startsWith('/login'), { timeout: 15000 });
}
