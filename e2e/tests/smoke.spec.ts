import { test, expect, type Page } from '@playwright/test';

// Full-app functional smoke: logs in as the demo user and walks every menu,
// every project view, and the quick-add → Belum diatur → move triage flow.
// Any uncaught page error on any screen fails the run.

const EMAIL = process.env.VELOX_EMAIL || 'budi.s@company.co.id';
const PASSWORD = process.env.VELOX_PASSWORD || 'demo1234';
const STAMP = Date.now().toString(36);
const TASK_UNDATED = `E2E undated ${STAMP}`;
const TASK_SHORT = `E2E ${STAMP.slice(-4)}`; // <= 8 chars → simple mode

test.describe.configure({ mode: 'serial' });

let page: Page;
const pageErrors: string[] = [];

test.beforeAll(async ({ browser }) => {
  page = await browser.newPage();
  page.on('pageerror', (e) => pageErrors.push(e.message));
});

test.afterAll(async ({ request }) => {
  // clean up every task this (or an aborted previous) run created
  try {
    const base = process.env.BASE_URL || 'https://velox.irfan-apps.online';
    const login = await request.post(`${base}/api/auth/login`, { data: { email: EMAIL, password: PASSWORD } });
    const { token } = await login.json();
    const boot = await request.get(`${base}/api/bootstrap`, { headers: { Authorization: `Bearer ${token}` } });
    const { tasks } = await boot.json();
    for (const t of tasks.filter((x: any) => /^E2E /.test(x.name))) {
      await request.delete(`${base}/api/tasks/${t.id}`, { headers: { Authorization: `Bearer ${token}` } });
    }
  } catch { /* cleanup is best-effort */ }
  await page.close();
});

async function nav(label: string) {
  await page.getByText(label, { exact: true }).first().click();
}

test('login: wrong password is rejected', async () => {
  await page.goto('/');
  await expect(page.getByText('Masuk ke Velox')).toBeVisible();
  await page.getByPlaceholder('Email').fill(EMAIL);
  await page.getByPlaceholder('Password', { exact: true }).fill('salah-total-123');
  await page.getByText('Masuk →').click();
  // still on the login screen
  await expect(page.getByText('Masuk ke Velox')).toBeVisible();
});

test('login: demo user signs in', async () => {
  await page.getByPlaceholder('Password', { exact: true }).fill(PASSWORD);
  await page.getByText('Masuk →').click();
  // the app restores the last screen after login — anchor on the sidebar, then go Home
  await expect(page.getByText('My Tasks', { exact: true })).toBeVisible({ timeout: 20_000 });
  await page.getByText('Home', { exact: true }).click();
  await expect(page.locator('[data-screen-label="Executive Dashboard"]')).toBeVisible();
});

test('nav: My Tasks renders', async () => {
  await nav('My Tasks');
  await expect(page.locator('[data-screen-label="My Tasks"]')).toBeVisible();
});

test('nav: Inbox renders with tabs and mark-all-read', async () => {
  await nav('Inbox');
  await expect(page.locator('[data-screen-label="Inbox"]')).toBeVisible();
  await page.getByText('Mentions', { exact: true }).click();
  await page.getByText('AI', { exact: true }).first().click();
  await page.getByText('All', { exact: true }).click();
  await page.getByText('Mark all read').click();
});

test('nav: Goals renders', async () => {
  await nav('Goals');
  await expect(page.locator('[data-screen-label="Goals"]')).toBeVisible();
});

test('nav: Chat renders', async () => {
  await nav('Chat');
  await expect(page.locator('[data-screen-label="Chat"]')).toBeVisible();
});

test('nav: Velox AI page renders', async () => {
  await nav('Velox AI');
  // the AI page has no data-screen-label; its composer is the stable anchor
  await expect(page.locator('textarea, input').last()).toBeVisible();
});

test('nav: Reports renders', async () => {
  await nav('Reports');
  await expect(page.locator('[data-screen-label="Reports"]')).toBeVisible();
});

test('nav: Trash renders', async () => {
  await nav('Trash');
  await expect(page.locator('[data-screen-label="Trash"]')).toBeVisible();
});

test('nav: Admin renders', async () => {
  await nav('Admin');
  await expect(page.getByText('Members & roles', { exact: true })).toBeVisible();
});

test('project: all six views render', async () => {
  // sidebar projects are folded inside category groups
  await page.getByText('IT Operations', { exact: true }).click();
  await page.getByText('Network Refresh 2026').first().click();
  const views: Array<[string, string | null]> = [
    ['List', 'List view'],
    ['Board', 'Board view'],
    ['Calendar', 'Calendar view'],
    ['Workload', 'Workload view'],
    ['Dashboard', 'Project dashboard'],
    ['Gantt', null], // gantt has no data-screen-label; asserted by absence of errors
  ];
  for (const [tab, label] of views) {
    await page.getByText(tab, { exact: true }).first().click();
    if (label) await expect(page.locator(`[data-screen-label="${label}"]`)).toBeVisible();
    await page.waitForTimeout(250);
  }
});

test('quick add: undated task lands in Belum diatur, assigned to me', async () => {
  await page.getByText('Quick add', { exact: true }).click();
  const ta = page.getByPlaceholder(/Ketik apa saja/);
  await expect(ta).toBeVisible();
  // the guidance example stays visible as a note
  await expect(page.getByText('Contoh:')).toBeVisible();
  await ta.fill(TASK_UNDATED);
  await expect(page.getByText('Parsed preview')).toBeVisible();
  // default project chip is the inbox; default assignee is the creator
  await expect(page.getByText('📥 Belum diatur').first()).toBeVisible();
  await expect(page.getByText(/👤 Budi/).first()).toBeVisible();
  await page.getByText('Create task', { exact: true }).click();
  await expect(page.getByText(/Task dibuat di/).first()).toBeVisible();
  await expect(page.getByText('Buka', { exact: true }).first()).toBeVisible();
});

test('my tasks: undated inbox task is visible in the triage group', async () => {
  await nav('My Tasks');
  await expect(page.getByText(/📥 Belum diatur/)).toBeVisible();
  await expect(page.getByText(TASK_UNDATED)).toBeVisible();
});

test('my tasks: move the task to a real project', async () => {
  const row = page.locator('div').filter({ hasText: TASK_UNDATED }).last();
  await page.getByText(/Move to|Pindahkan ke/).first().click();
  // grouped by workspace
  await expect(page.getByText('IT Division').first()).toBeVisible();
  await page.getByText('ITSM Rollout').last().click();
  await expect(page.getByText(/Dipindahkan ke ITSM Rollout/).first()).toBeVisible();
});

test('quick add: short text creates a task due today', async () => {
  await page.getByText('Quick add', { exact: true }).click();
  await page.getByPlaceholder(/Ketik apa saja/).fill(TASK_SHORT);
  await expect(page.getByText('Create as task')).toBeVisible();
  await expect(page.getByText(/due today/)).toBeVisible();
  await page.getByText('Create as task').click();
  await expect(page.getByText(/Task dibuat di/).first()).toBeVisible();
  await nav('My Tasks');
  await expect(page.getByText(TASK_SHORT, { exact: true })).toBeVisible();
});

test('task detail: open, comment with @mention', async () => {
  await page.getByText(TASK_SHORT, { exact: true }).click();
  const composer = page.getByPlaceholder(/Write a comment/);
  await expect(composer).toBeVisible();
  await composer.fill('@Dewi tolong cek hasil E2E ini');
  await page.getByText('Send', { exact: true }).click();
  await expect(page.getByText('tolong cek hasil E2E ini')).toBeVisible();
  await page.keyboard.press('Escape');
});

test('command palette: search finds the task', async () => {
  await page.getByText(/Search tasks, projects/).click();
  const pal = page.getByPlaceholder(/Search or jump to/);
  await expect(pal).toBeVisible();
  await pal.fill(TASK_UNDATED);
  await expect(page.getByText(TASK_UNDATED).first()).toBeVisible();
  await page.keyboard.press('Escape');
});

test('settings: screen renders', async () => {
  await nav('Settings');
  await page.waitForTimeout(400); // settings mounts panels lazily
});

test('no uncaught page errors anywhere in the run', async () => {
  expect(pageErrors, `Uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
});
