import { test, expect } from '@playwright/test';

// Mobile (iPhone-size) smoke: the sidebar must behave as an off-canvas drawer —
// hidden by default, opened via the ☰ button, closed by nav taps and backdrop.

const EMAIL = process.env.VELOX_EMAIL || 'budi.s@company.co.id';
const PASSWORD = process.env.VELOX_PASSWORD || 'demo1234';

test.use({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
});

test('mobile: drawer sidebar opens, navigates, and closes', async ({ page }) => {
  const errs: string[] = [];
  page.on('pageerror', (e) => errs.push(e.message));

  await page.goto('/');
  await page.getByPlaceholder('Email').fill(EMAIL);
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByText('Masuk →').click();
  await expect(page.getByTitle('Menu')).toBeVisible({ timeout: 20_000 });

  // drawer is hidden by default: drawer-only labels not visible ("Reports"
  // exists only in the drawer — "My Tasks" is also in the bottom tab bar)
  await expect(page.getByText('Reports', { exact: true })).not.toBeInViewport();

  // ☰ opens the drawer with full labels
  await page.getByTitle('Menu').click();
  await expect(page.getByText('Reports', { exact: true })).toBeInViewport();
  await expect(page.getByText('Goals', { exact: true })).toBeInViewport();

  // tapping a nav item navigates AND closes the drawer (first() = drawer copy)
  await page.getByText('My Tasks', { exact: true }).first().click();
  await expect(page.locator('[data-screen-label="My Tasks"]')).toBeVisible();
  await expect(page.getByText('Goals', { exact: true })).not.toBeInViewport();

  // backdrop tap closes it too
  await page.getByTitle('Menu').click();
  await expect(page.getByText('Goals', { exact: true })).toBeInViewport();
  await page.mouse.click(360, 500);
  await expect(page.getByText('Goals', { exact: true })).not.toBeInViewport();

  // compact topbar: search icon opens the palette
  await page.getByTitle(/Search tasks/).click();
  await expect(page.getByPlaceholder(/Search or jump to/)).toBeVisible();
  await page.keyboard.press('Escape');

  // bottom tab bar: nav + central quick-add
  const nav = page.locator('div').filter({ hasText: /^Home$/ }).last();
  await expect(nav).toBeVisible();
  await page.getByText('Inbox', { exact: true }).last().click();
  await expect(page.locator('[data-screen-label="Inbox"]')).toBeVisible();
  await page.getByText('Home', { exact: true }).last().click();
  await expect(page.locator('[data-screen-label="Executive Dashboard"]')).toBeVisible();

  expect(errs, `Uncaught errors:\n${errs.join('\n')}`).toEqual([]);
});

test('pwa: manifest, icons and service worker are served', async ({ request }) => {
  const base = process.env.BASE_URL || 'https://velox.irfan-apps.online';
  const man = await request.get(`${base}/manifest.webmanifest`);
  expect(man.ok()).toBeTruthy();
  const m = await man.json();
  expect(m.display).toBe('standalone');
  const png = m.icons.filter((i: any) => i.type === 'image/png').map((i: any) => i.src);
  expect(png).toContain('/icon-192.png');
  expect(png).toContain('/icon-512.png');
  for (const path of ['/icon-192.png', '/icon-512.png', '/icon-180.png', '/sw.js']) {
    const r = await request.get(`${base}${path}`);
    expect(r.status(), path).toBe(200);
  }
});
