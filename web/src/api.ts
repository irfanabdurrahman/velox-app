import type { Task } from './types';

const TOKEN_KEY = 'velox-token';
export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t: string | null) => {
  if (t) localStorage.setItem(TOKEN_KEY, t);
  else localStorage.removeItem(TOKEN_KEY);
};

let onAuthLost: (() => void) | null = null;
export const setAuthLostHandler = (fn: () => void) => { onAuthLost = fn; };

// Single-flight refresh so concurrent 401s don't spam /auth/refresh.
let refreshing: Promise<boolean> | null = null;
async function refresh(): Promise<boolean> {
  if (!refreshing) {
    refreshing = fetch('/api/auth/refresh', { method: 'POST', credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return false;
        const body = await r.json();
        setToken(body.token);
        return true;
      })
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}

async function raw(path: string, opts: RequestInit, retry = true): Promise<Response> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...(opts.headers as any) };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`/api${path}`, { ...opts, headers, credentials: 'include' });
  // On expired/invalid access token, try one silent refresh + retry.
  if (res.status === 401 && retry && !path.startsWith('/auth/')) {
    const okr = await refresh();
    if (okr) return raw(path, opts, false);
    onAuthLost?.();
  }
  return res;
}

async function req(path: string, opts: RequestInit = {}) {
  const res = await raw(path, opts);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.status === 204 ? null : res.json();
}

export const api = {
  login: (email: string, password: string) =>
    req('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    req('/auth/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),
  refresh: () => refresh(),
  logout: () => req('/auth/logout', { method: 'POST' }).catch(() => {}),
  bootstrap: () => req('/bootstrap'),
  taskDetail: (id: string) => req(`/tasks/${id}/detail`),
  createTask: (t: Partial<Task>) => req('/tasks', { method: 'POST', body: JSON.stringify(t) }),
  updateTask: (id: string, patch: Partial<Task>) => req(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteTask: (id: string) => req(`/tasks/${id}`, { method: 'DELETE' }),
  addComment: (id: string, c: any) => req(`/tasks/${id}/comments`, { method: 'POST', body: JSON.stringify(c) }),
  createProject: (p: any) => req('/projects', { method: 'POST', body: JSON.stringify(p) }),
  ensureInboxProject: (ws: string) => req(`/ws/${ws}/inbox-project`, { method: 'POST' }),
  moveTask: (id: string, pid: string) => req(`/tasks/${id}/move`, { method: 'POST', body: JSON.stringify({ pid }) }),
  createCategory: (ws: string, label: string, color?: string) => req(`/ws/${ws}/categories`, { method: 'POST', body: JSON.stringify({ label, color }) }),
  updateCategory: (id: string, patch: { label?: string; color?: string | null; ord?: number }) => req(`/categories/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteCategory: (id: string) => req(`/categories/${id}`, { method: 'DELETE' }),
  markRead: (id: string, unread: boolean) => req(`/inbox/${id}`, { method: 'PATCH', body: JSON.stringify({ unread }) }),
  markAllRead: () => req('/inbox/read-all', { method: 'POST' }),
  sendChat: (chan: string, m: any) => req(`/chat/${chan}/messages`, { method: 'POST', body: JSON.stringify(m) }),
  aiChat: (messages: { role: string; content: string }[]) => req('/ai/chat', { method: 'POST', body: JSON.stringify({ messages }) }),
  aiParse: (text: string) => req('/ai/parse-task', { method: 'POST', body: JSON.stringify({ text }) }),
  aiRisk: () => req('/ai/risk'),

  // ---- Wave 1: data ops ----
  trash: () => req('/trash'),
  restoreTask: (id: string) => req(`/tasks/${id}/restore`, { method: 'POST' }),
  purgeTask: (id: string) => req(`/tasks/${id}/purge`, { method: 'DELETE' }),
  duplicateTask: (id: string) => req(`/tasks/${id}/duplicate`, { method: 'POST' }),
  convertTask: (id: string, parentId: string | null) => req(`/tasks/${id}/convert`, { method: 'POST', body: JSON.stringify({ parentId }) }),
  bulkTasks: (ids: string[], patch: any, del?: boolean) => req('/tasks/bulk', { method: 'POST', body: JSON.stringify({ ids, patch, del }) }),
  linkHome: (id: string, projectId: string) => req(`/tasks/${id}/homes`, { method: 'POST', body: JSON.stringify({ projectId }) }),
  unlinkHome: (id: string, pid: string) => req(`/tasks/${id}/homes/${pid}`, { method: 'DELETE' }),
  logTime: (id: string, minutes: number, day: number, note?: string) => req(`/tasks/${id}/time`, { method: 'POST', body: JSON.stringify({ minutes, day, note }) }),
  taskTime: (id: string) => req(`/tasks/${id}/time`),
  reactComment: (id: string, emoji: string) => req(`/comments/${id}/react`, { method: 'POST', body: JSON.stringify({ emoji }) }),
  taskComments: (id: string) => req(`/tasks/${id}/comments`),

  // sections / custom fields / status
  addSection: (pid: string, name: string) => req(`/projects/${pid}/sections`, { method: 'POST', body: JSON.stringify({ name }) }),
  patchSection: (id: string, patch: any) => req(`/sections/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delSection: (id: string) => req(`/sections/${id}`, { method: 'DELETE' }),
  addField: (pid: string, f: any) => req(`/projects/${pid}/fields`, { method: 'POST', body: JSON.stringify(f) }),
  delField: (id: string) => req(`/fields/${id}`, { method: 'DELETE' }),
  postStatus: (pid: string, status: string, summary: string) => req(`/projects/${pid}/status`, { method: 'POST', body: JSON.stringify({ status, summary }) }),
  patchProject: (pid: string, patch: any) => req(`/projects/${pid}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  duplicateProject: (pid: string, name?: string) => req(`/projects/${pid}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) }),
  deleteProject: (pid: string) => req(`/projects/${pid}`, { method: 'DELETE' }),
  purgeProject: (pid: string) => req(`/projects/${pid}?hard=1`, { method: 'DELETE' }),
  restoreProject: (pid: string) => req(`/projects/${pid}/restore`, { method: 'POST' }),
  trashProjects: (ws: string) => req(`/ws/${ws}/trash-projects`),
  archivedProjects: (ws: string) => req(`/ws/${ws}/archived-projects`),
  shareProject: (pid: string, on: boolean) => req(`/projects/${pid}/share`, { method: 'POST', body: JSON.stringify({ on }) }),
  saveAsTemplate: (pid: string) => req(`/projects/${pid}/duplicate`, { method: 'POST', body: JSON.stringify({ asTemplate: true }) }),
  taskActivity: (id: string) => req(`/tasks/${id}/activity`),
  goals: (ws: string) => req(`/ws/${ws}/goals`),
  createGoal: (ws: string, name: string) => req(`/ws/${ws}/goals`, { method: 'POST', body: JSON.stringify({ name }) }),
  patchGoal: (id: string, patch: any) => req(`/goals/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delGoal: (id: string) => req(`/goals/${id}`, { method: 'DELETE' }),
  addKr: (goalId: string, kr: any) => req(`/goals/${goalId}/krs`, { method: 'POST', body: JSON.stringify(kr) }),
  patchKr: (id: string, patch: any) => req(`/krs/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delKr: (id: string) => req(`/krs/${id}`, { method: 'DELETE' }),
  downloadProjectCsv: async (pid: string, name: string) => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/projects/${pid}/export.csv`, { headers, credentials: 'include' });
    if (!res.ok) throw new Error('export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name.replace(/[^\w.-]+/g, '_')}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(url);
  },

  // attachments
  uploadFile: async (taskId: string, file: File) => {
    const fd = new FormData();
    fd.append('file', file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
    const res = await fetch(`/api/tasks/${taskId}/files`, { method: 'POST', body: fd, headers, credentials: 'include' });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'upload failed');
    return res.json();
  },
  addLink: (taskId: string, url: string, name: string) => req(`/tasks/${taskId}/links`, { method: 'POST', body: JSON.stringify({ url, name }) }),
  delFile: (id: string) => req(`/files/${id}`, { method: 'DELETE' }),

  // ---- Wave 2: integrations ----
  listApiKeys: (ws: string) => req(`/ws/${ws}/apikeys`),
  createApiKey: (ws: string, name: string, scopes: string[]) => req(`/ws/${ws}/apikeys`, { method: 'POST', body: JSON.stringify({ name, scopes }) }),
  revokeApiKey: (id: string) => req(`/apikeys/${id}`, { method: 'DELETE' }),
  listWebhooks: (ws: string) => req(`/ws/${ws}/webhooks`),
  createWebhook: (ws: string, url: string, events: string[]) => req(`/ws/${ws}/webhooks`, { method: 'POST', body: JSON.stringify({ url, events }) }),
  patchWebhook: (id: string, patch: any) => req(`/webhooks/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delWebhook: (id: string) => req(`/webhooks/${id}`, { method: 'DELETE' }),
  testWebhook: (id: string) => req(`/webhooks/${id}/test`, { method: 'POST' }),
  eventCatalog: () => req('/events/catalog'),
  listRules: (ws: string) => req(`/ws/${ws}/rules`),
  createRule: (ws: string, r: any) => req(`/ws/${ws}/rules`, { method: 'POST', body: JSON.stringify(r) }),
  patchRule: (id: string, patch: any) => req(`/rules/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  delRule: (id: string) => req(`/rules/${id}`, { method: 'DELETE' }),
  listForms: (ws: string) => req(`/ws/${ws}/forms`),
  createForm: (ws: string, f: any) => req(`/ws/${ws}/forms`, { method: 'POST', body: JSON.stringify(f) }),
  delForm: (id: string) => req(`/forms/${id}`, { method: 'DELETE' }),
  mcpManifest: () => req('/mcp'),

  // ---- Wave 5: reports ----
  reportBurndown: (pid: string) => req(`/reports/burndown?projectId=${pid}`),
  reportVelocity: (ws: string) => req(`/reports/velocity?workspaceId=${ws}`),
  reportCfd: (pid: string) => req(`/reports/cfd?projectId=${pid}`),
  reportTimesheet: (ws: string, from: number, to: number) => req(`/reports/timesheet?workspaceId=${ws}&from=${from}&to=${to}`),
  reportPortfolio: (ws: string) => req(`/reports/portfolio?workspaceId=${ws}`),
  scheduleReport: (ws: string, cadence: string, email: string) => req('/reports/schedule', { method: 'POST', body: JSON.stringify({ workspaceId: ws, cadence, email }) }),

  // ---- Wave 3/4: auth-x + realtime ----
  ssoStatus: () => req('/auth/sso/status'),
  twoFASetup: () => req('/2fa/setup', { method: 'POST' }),
  twoFAEnable: (token: string) => req('/2fa/enable', { method: 'POST', body: JSON.stringify({ token }) }),
  twoFADisable: (token: string) => req('/2fa/disable', { method: 'POST', body: JSON.stringify({ token }) }),
  exportWs: (ws: string) => req(`/ws/${ws}/export`),
  auditLog: (ws: string) => req(`/ws/${ws}/audit`),
  createWorkspace: (name: string) => req('/workspaces', { method: 'POST', body: JSON.stringify({ name }) }),
  deleteWorkspace: (ws: string, confirmName: string) => req(`/workspaces/${ws}`, { method: 'DELETE', body: JSON.stringify({ confirmName }) }),
  pushVapid: () => req('/push/vapid'),
  pushSubscribe: (subscription: any) => req('/push/subscribe', { method: 'POST', body: JSON.stringify({ subscription }) }),
  notifPrefs: () => req('/notif/prefs'),
  setNotifPrefs: (prefs: any) => req('/notif/prefs', { method: 'PATCH', body: JSON.stringify(prefs) }),
  notifChannels: () => req('/notif/channels/status'),
};
