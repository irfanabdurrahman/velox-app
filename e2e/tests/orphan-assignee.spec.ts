import { test, expect } from '@playwright/test';

const EMAIL = process.env.VELOX_EMAIL || 'budi.s@company.co.id';
const PASSWORD = process.env.VELOX_PASSWORD || '';

test('Gantt stays rendered when a task assignee is no longer in the workspace directory', async ({ page, request }) => {
  expect(PASSWORD, 'VELOX_PASSWORD is required').not.toBe('');

  const login = await request.post('/api/auth/login', { data: { email: EMAIL, password: PASSWORD } });
  expect(login.ok()).toBeTruthy();
  const { token } = await login.json();

  await page.addInitScript((accessToken) => {
    localStorage.setItem('velox-token', accessToken);
  }, token);

  let orphanedUser = '';
  await page.route('**/api/bootstrap', async (route) => {
    const response = await route.fetch();
    const body = await response.json();
    const task = body.tasks.find((t: any) => t.a && t.s != null && t.e != null && body.members[t.a]);
    expect(task, 'fixture needs a scheduled assigned task').toBeTruthy();

    const project = body.projects.find((p: any) => p.id === task.pid);
    const workspace = body.workspaces.find((w: any) => w.id === project.ws);
    orphanedUser = task.a;
    delete body.members[orphanedUser];
    body.workspaces = [workspace, ...body.workspaces.filter((w: any) => w.id !== workspace.id)];
    body.projects = [project, ...body.projects.filter((p: any) => p.id !== project.id)];

    await route.fulfill({ response, json: body });
  });

  const pageErrors: string[] = [];
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.goto('/');
  await page.waitForTimeout(3_000);

  expect(orphanedUser).not.toBe('');
  expect(pageErrors, `Uncaught errors:\n${pageErrors.join('\n')}`).toEqual([]);
  await expect(page.getByText('My Tasks', { exact: true })).toBeVisible();
  await expect(page.getByText('Gantt', { exact: true }).first()).toBeVisible();
  await expect(page.locator('body')).not.toBeEmpty();
});
