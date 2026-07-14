import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma } from './prisma.ts';
import { EP, todayIdx } from './data.ts';
import {
  hashPassword, verifyPassword, signAccess, issueRefresh, rotateRefresh, revokeRefresh,
  requireAuth, refreshCookieOpts, type AuthedRequest,
} from './auth.ts';
import {
  accessibleWorkspaceIds, assertCan, assertMember, roleIn, workspaceOfProject, workspaceOfTask, HttpError,
} from './authz.ts';
import { aiEnabled, chat, parseTaskNL, riskReport, type ChatMessage } from './ai.ts';
import { createServer } from 'node:http';
import { attachWs } from './ws.ts';
import { emit } from './events.ts';
import { mountRoutes } from './routes/index.ts';
import { logAudit } from './routes/authx.ts';
import { notifyUnblocked } from './events.ts';
import { startSchedulers } from './scheduler.ts';

const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGIN = (process.env.CORS_ORIGIN || 'http://localhost:5173').split(',');

const app = express();
// Behind the nginx reverse proxy: trust exactly one hop so req.ip reflects the
// real client (X-Forwarded-For) — without this, rate limits collapse into a
// single global bucket and lock out every user at once.
app.set('trust proxy', 1);
app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false });

// ---- helpers -------------------------------------------------------------
const publicUser = (u: any) => ({ id: u.id, email: u.email, name: u.name, initials: u.initials, color: u.color, twoFAEnabled: !!u.twoFAEnabled });
export const taskDTO = (t: any) => ({
  id: t.id, pid: t.projectId, par: t.parentId, name: t.name, a: t.assigneeId,
  pr: t.pr, pg: t.pg, st: t.st, s: t.s, e: t.e, ms: t.ms, crit: t.crit,
  bs: t.bs, be: t.be, lbl: t.lbl ?? [], deps: t.deps ?? [], est: t.est, tt: t.tt,
  descr: t.descr ?? '', checklist: t.checklist ?? [], cf: t.cf ?? {},
  sectionId: t.sectionId ?? null, recurrence: t.recurrence ?? null, ord: t.ord ?? 0,
  a2: t.assignees ? t.assignees.map((x: any) => x.userId) : undefined,
  watchers: t.watchers ? t.watchers.map((x: any) => x.userId) : undefined,
  homes: t.homes ? t.homes.map((x: any) => x.projectId) : undefined,
});

// async route wrapper that funnels HttpError -> proper status
const h = (fn: (req: AuthedRequest, res: express.Response) => Promise<any>) =>
  (req: AuthedRequest, res: express.Response) => fn(req, res).catch((e) => {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  });

const bad = (res: express.Response, e: z.ZodError) => res.status(400).json({ error: 'validation', details: e.issues });

// ---- auth ----------------------------------------------------------------
const credsSchema = z.object({ email: z.string().email(), password: z.string().min(1).max(200) });
// Registration enforces a real password policy; login stays lenient (verification decides).
const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'password must be at least 8 characters').max(200),
  name: z.string().min(1).max(120),
});

async function completeLogin(res: express.Response, user: any, extra: object = {}) {
  const { raw } = await issueRefresh(user.id);
  res.cookie('velox_rt', raw, refreshCookieOpts);
  res.json({ token: signAccess(user), user: publicUser(user), ...extra });
}

app.post('/api/auth/register', authLimiter, h(async (req, res) => {
  const p = registerSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const { name, email, password } = p.data;
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(409, 'account already exists');
  const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const user = await prisma.user.create({
    data: { id: nanoid(10), email, name, passwordHash: await hashPassword(password), initials, color: '#6366F1', isRegistered: true },
  });
  // New self-serve users get their own Personal workspace they own.
  const wsId = `ws_${nanoid(6)}`;
  await prisma.workspace.create({ data: { id: wsId, name: 'Personal', color: '#64748B', ini: 'P', meta: '0 projects' } });
  await prisma.membership.create({ data: { userId: user.id, workspaceId: wsId, role: 'OWNER' } });
  await completeLogin(res, user, { created: true });
}));

app.post('/api/auth/login', authLimiter, h(async (req, res) => {
  const p = credsSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const user = await prisma.user.findUnique({ where: { email: p.data.email } });
  // Constant-ish: always run a verify to reduce user-enumeration timing signal.
  const ok = user ? await verifyPassword(user.passwordHash, p.data.password) : await verifyPassword('$argon2id$v=19$m=19456,t=2,p=1$c2FsdHNhbHRzYWx0$0000000000000000000000000000000000000000000', 'x');
  if (!user || !ok) throw new HttpError(401, 'invalid email or password');
  await completeLogin(res, user);
}));

app.post('/api/auth/refresh', authLimiter, h(async (req, res) => {
  const raw = req.cookies?.velox_rt;
  if (!raw) throw new HttpError(401, 'no refresh token');
  try {
    const { user, access, refresh } = await rotateRefresh(raw);
    res.cookie('velox_rt', refresh, refreshCookieOpts);
    res.json({ token: access, user: publicUser(user) });
  } catch {
    res.clearCookie('velox_rt', { ...refreshCookieOpts, maxAge: undefined });
    throw new HttpError(401, 'invalid refresh token');
  }
}));

app.post('/api/auth/logout', h(async (req, res) => {
  await revokeRefresh(req.cookies?.velox_rt);
  res.clearCookie('velox_rt', { ...refreshCookieOpts, maxAge: undefined });
  res.json({ ok: true });
}));

app.use('/api', apiLimiter);

// ---- bootstrap (scoped to the user's accessible workspaces) --------------
app.get('/api/bootstrap', requireAuth, h(async (req, res) => {
  const uid = req.user!.id;
  const wsIds = await accessibleWorkspaceIds(uid);
  // hidden projects are only visible to their owner
  const projWhere = { workspaceId: { in: wsIds }, archived: false, deletedAt: null, isTemplate: false, OR: [{ privacy: { not: 'hidden' } }, { ownerId: uid }] };
  const [me, workspaces, categories, projects, tasks, notifs, memberships, myDms, sections, customFields, statusUpdates] = await Promise.all([
    prisma.user.findUnique({ where: { id: uid } }),
    prisma.workspace.findMany({ where: { id: { in: wsIds } } }),
    prisma.category.findMany(),
    prisma.project.findMany({ where: projWhere }),
    // stable ordering; exclude trashed
    prisma.task.findMany({ where: { project: { workspaceId: { in: wsIds }, deletedAt: null, isTemplate: false }, deletedAt: null }, orderBy: [{ ord: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], include: { assignees: true, watchers: true, homes: true } }),
    prisma.notification.findMany({ where: { userId: uid }, orderBy: { ord: 'asc' } }),
    prisma.membership.findMany({ where: { workspaceId: { in: wsIds } } }),
    prisma.chatChannelMember.findMany({ where: { userId: uid }, select: { channelId: true } }),
    prisma.section.findMany({ where: { project: { workspaceId: { in: wsIds } } }, orderBy: { ord: 'asc' } }),
    prisma.customField.findMany({ where: { project: { workspaceId: { in: wsIds } } }, orderBy: { ord: 'asc' } }),
    prisma.statusUpdate.findMany({ where: { project: { workspaceId: { in: wsIds } } }, orderBy: { createdAt: 'desc' }, take: 100 }),
  ]);
  // channels: my workspaces' channels + DMs I actually participate in
  const channels = await prisma.chatChannel.findMany({
    where: { OR: [{ workspaceId: { in: wsIds } }, { id: { in: myDms.map((d) => d.channelId) } }] },
    orderBy: { ord: 'asc' },
  });
  // members directory: ONLY people sharing a workspace with me — never the whole user table
  const memberIds = [...new Set(memberships.map((m) => m.userId))];
  if (!memberIds.includes(uid)) memberIds.push(uid);
  const users = await prisma.user.findMany({ where: { id: { in: memberIds } } });
  const roleByUser: Record<string, Record<string, string>> = {};
  for (const m of memberships) (roleByUser[m.userId] = roleByUser[m.userId] || {})[m.workspaceId] = m.role;
  const members: Record<string, any> = {};
  for (const u of users) members[u.id] = { n: u.name, c: u.color, role: roleByUser[u.id] ? Object.values(roleByUser[u.id])[0] : '', email: u.email };
  const chatMsgs: Record<string, any[]> = {};
  for (const c of channels) {
    const msgs = await prisma.chatMessage.findMany({ where: { channelId: c.id }, orderBy: [{ ord: 'asc' }, { id: 'asc' }] });
    chatMsgs[c.id] = msgs.map((m) => ({ who: m.authorId, when: m.whenTxt, txt: m.txt, ref: m.ref }));
  }
  const TODAY = todayIdx();
  res.json({
    meta: { EP, TODAY },
    user: publicUser(me),
    members,
    memberships: memberships.map((m) => ({ userId: m.userId, ws: m.workspaceId, role: m.role })),
    myRoles: roleByUser[uid] || {},
    workspaces,
    categories,
    projects: projects.map((p) => ({ id: p.id, name: p.name, code: p.code, cat: p.categoryId, ws: p.workspaceId, owner: p.ownerId, st: p.st, prog: p.prog, due: p.due, color: p.color, privacy: p.privacy, shareToken: p.shareToken ?? null })),
    templates: (await prisma.project.findMany({ where: { workspaceId: { in: wsIds }, isTemplate: true, deletedAt: null } })).map((p) => ({ id: p.id, name: p.name, code: p.code, cat: p.categoryId, ws: p.workspaceId, owner: p.ownerId, st: p.st, prog: p.prog, due: p.due, color: p.color, privacy: p.privacy })),
    tasks: tasks.map(taskDTO),
    sections: sections.map((s) => ({ id: s.id, pid: s.projectId, name: s.name, ord: s.ord })),
    customFields: customFields.map((c) => ({ id: c.id, pid: c.projectId, name: c.name, kind: c.kind, config: c.config, ord: c.ord })),
    statusUpdates: statusUpdates.map((s) => ({ id: s.id, pid: s.projectId, author: s.authorId, status: s.status, summary: s.summary, when: s.createdAt })),
    inbox: notifs.map((n) => ({ id: n.id, kind: n.kind, ic: n.ic, unread: n.unread, when: n.whenTxt, txt: n.txt, ref: n.ref, who: n.who, go: n.go })),
    chatChannels: channels.map((c) => ({ id: c.id, kind: c.kind, name: c.name })),
    chatMsgs,
    ...computeWorkload(tasks, memberIds, TODAY),
    aiEnabled: aiEnabled(),
  });
}));

// Real workload: distribute each open assigned task's working days (6h/day,
// Mon–Fri) across 8 week buckets starting from the current week's Monday.
function computeWorkload(tasks: { assigneeId: string | null; st: string; ms: boolean; s: number | null; e: number | null }[], memberIds: string[], TODAY: number) {
  const weekStart = TODAY - (((TODAY % 7) + 7) % 7); // EP is a Monday
  const weeks = Array.from({ length: 8 }, (_, i) => weekStart + i * 7);
  const workload: Record<string, number[]> = {};
  for (const id of memberIds) workload[id] = [0, 0, 0, 0, 0, 0, 0, 0];
  for (const t of tasks) {
    if (!t.assigneeId || t.st === 'done' || t.ms || t.s == null || t.e == null) continue;
    const row = workload[t.assigneeId];
    if (!row) continue;
    for (let d = Math.max(t.s, weeks[0]); d <= Math.min(t.e, weeks[7] + 6); d++) {
      if (((d % 7) + 7) % 7 >= 5) continue; // weekends
      row[Math.floor((d - weeks[0]) / 7)] += 6;
    }
  }
  const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const workloadWeeks = weeks.map((w) => { const dt = new Date(EP + w * 864e5); return MO[dt.getUTCMonth()] + ' ' + dt.getUTCDate(); });
  return { workload, workloadWeeks };
}

// ---- AI (DeepSeek / OpenAI-compatible, grounded in the user's data) -------
const todayISO = () => new Date(EP + todayIdx() * 864e5).toISOString().slice(0, 10);

app.get('/api/ai/status', requireAuth, (_req, res) => res.json({ enabled: aiEnabled() }));

const aiChatSchema = z.object({
  messages: z.array(z.object({ role: z.enum(['user', 'assistant', 'system']), content: z.string().max(8000) })).min(1).max(40),
});
app.post('/api/ai/chat', requireAuth, h(async (req, res) => {
  if (!aiEnabled()) throw new HttpError(503, 'AI is not configured on this server');
  const p = aiChatSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const uid = req.user!.id;
  const wsIds = await accessibleWorkspaceIds(uid);
  const projects = await prisma.project.findMany({ where: { workspaceId: { in: wsIds } } });
  const tasks = await prisma.task.findMany({ where: { project: { workspaceId: { in: wsIds } } }, select: { st: true, e: true, name: true, projectId: true } });
  const overdue = tasks.filter((t) => t.st !== 'done' && t.e != null && t.e < todayIdx()).length;
  const portfolio = projects.map((p) => `${p.name} [${p.st}, ${p.prog}%]`).join('; ');
  const sys: ChatMessage = {
    role: 'system',
    content: `You are Velox AI, an assistant inside a project-management app. Today is ${todayISO()}. ` +
      `Be concise and action-oriented. The user's portfolio: ${portfolio}. Overdue tasks: ${overdue}. ` +
      `When asked about risk/delays, reason from project status (risk/bad = attention) and give concrete next steps.`,
  };
  const text = await chat([sys, ...(p.data.messages as ChatMessage[])], { temperature: 0.4, maxTokens: 900 });
  res.json({ text });
}));

// Structured delay-risk report grounded in the user's real portfolio.
app.get('/api/ai/risk', requireAuth, h(async (req: any, res) => {
  const uid = req.user!.id;
  const wsIds = await accessibleWorkspaceIds(uid);
  const T = todayIdx();
  const projects = await prisma.project.findMany({ where: { workspaceId: { in: wsIds }, archived: false } });
  const rows = [];
  for (const p of projects) {
    const tasks = await prisma.task.findMany({ where: { projectId: p.id, deletedAt: null, ms: false }, select: { st: true, e: true, crit: true, updatedAt: true } });
    const overdue = tasks.filter((t) => t.st !== 'done' && t.e != null && t.e < T).length;
    const critLate = tasks.filter((t) => t.crit && t.st !== 'done' && t.e != null && t.e < T).length;
    const newest = tasks.reduce((a, t) => Math.max(a, t.updatedAt.getTime()), 0);
    const staleDays = newest ? Math.floor((Date.now() - newest) / 864e5) : 30;
    rows.push({ id: p.id, name: p.name, st: p.st, prog: p.prog, overdue, staleDays, critLate });
  }
  const report = await riskReport(rows);
  res.json(report);
}));

const aiParseSchema = z.object({ text: z.string().min(1).max(1000) });
app.post('/api/ai/parse-task', requireAuth, h(async (req, res) => {
  if (!aiEnabled()) throw new HttpError(503, 'AI is not configured on this server');
  const p = aiParseSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const uid = req.user!.id;
  const wsIds = await accessibleWorkspaceIds(uid);
  const [users, projects] = await Promise.all([
    prisma.user.findMany({ select: { id: true, name: true } }),
    prisma.project.findMany({ where: { workspaceId: { in: wsIds } }, select: { id: true, name: true } }),
  ]);
  const parsed = await parseTaskNL(p.data.text, { members: users, projects, todayISO: todayISO() });
  if (!parsed) throw new HttpError(422, 'could not parse');
  // convert dueISO -> day index for the client
  let due: number | null = null;
  if (parsed.dueISO) { const d = Date.parse(parsed.dueISO + 'T00:00:00Z'); if (!Number.isNaN(d)) due = Math.round((d - EP) / 864e5); }
  res.json({ name: parsed.name ?? '', assigneeId: parsed.assigneeId ?? null, priority: parsed.priority ?? 'med', projectId: parsed.projectId ?? null, dueISO: parsed.dueISO ?? null, due });
}));

// ---- tasks ---------------------------------------------------------------
app.get('/api/tasks/:id/detail', requireAuth, h(async (req, res) => {
  const ws = await workspaceOfTask(req.params.id);
  await assertMember(req.user!.id, ws);
  const [comments, files] = await Promise.all([
    prisma.comment.findMany({ where: { taskId: req.params.id }, orderBy: { createdAt: 'asc' } }),
    prisma.fileAsset.findMany({ where: { taskId: req.params.id } }),
  ]);
  res.json({
    comments: comments.map((c) => ({ id: c.id, who: c.authorId, when: c.whenTxt, txt: c.txt, rx: c.rx ?? [], parentId: (c as any).parentId ?? null })),
    files: files.map((f) => ({ id: f.id, n: f.n, s: f.s, k: f.k, url: f.url, bytes: f.bytes })),
  });
}));

// dependency now supports FS/SS/FF/SF + lag
const depSchema = z.object({ t: z.string(), type: z.enum(['FS', 'SS', 'FF', 'SF']).optional(), lag: z.number().int().optional(), crit: z.boolean().optional() });
const checkSchema = z.object({ id: z.string(), txt: z.string(), done: z.boolean() });
const taskCreate = z.object({
  id: z.string().optional(), pid: z.string(), par: z.string().nullish(), name: z.string().min(1).max(300),
  a: z.string().nullish(), pr: z.string().optional(), pg: z.number().int().min(0).max(100).optional(),
  st: z.string().optional(), s: z.number().int().nullish(), e: z.number().int().nullish(),
  ms: z.boolean().optional(), crit: z.boolean().optional(), bs: z.number().int().nullish(), be: z.number().int().nullish(),
  lbl: z.array(z.string()).optional(), deps: z.array(depSchema).optional(), est: z.string().nullish(), tt: z.string().nullish(),
  descr: z.string().max(50000).optional(), checklist: z.array(checkSchema).optional(), cf: z.record(z.string(), z.any()).optional(),
  sectionId: z.string().nullish(), recurrence: z.string().nullish(), ord: z.number().int().optional(),
  a2: z.array(z.string()).optional(), watchers: z.array(z.string()).optional(),
});
const taskPatch = taskCreate.partial().omit({ pid: true });

// normalize dates so start never exceeds end
function normDates(data: any, cur?: { s: number | null; e: number | null }) {
  const s = 's' in data ? data.s : cur?.s ?? null;
  const e = 'e' in data ? data.e : cur?.e ?? null;
  if (s != null && e != null && s > e) {
    if ('s' in data && !('e' in data)) data.e = s;
    else if ('e' in data && !('s' in data)) data.s = e;
    else { data.s = Math.min(s, e); data.e = Math.max(s, e); }
  }
  return data;
}

app.post('/api/tasks', requireAuth, h(async (req, res) => {
  const p = taskCreate.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const ws = await workspaceOfProject(p.data.pid);
  await assertCan(req.user!.id, ws, 'MEMBER');
  const d = normDates({ ...p.data });
  if (d.par) {
    // parent must exist in the same project
    const parent = await prisma.task.findUnique({ where: { id: d.par }, select: { projectId: true } });
    if (!parent || parent.projectId !== d.pid) throw new HttpError(400, 'parent task must be in the same project');
  }
  const created = await prisma.task.create({
    data: {
      // ids are ALWAYS server-minted — client-supplied ids collide across sessions
      id: nanoid(10), projectId: d.pid, parentId: d.par ?? null, name: d.name, assigneeId: d.a ?? null,
      pr: d.pr ?? 'med', pg: d.pg ?? 0, st: d.st ?? 'mut', s: d.s ?? null, e: d.e ?? null,
      ms: d.ms ?? false, crit: d.crit ?? false, bs: d.bs ?? null, be: d.be ?? null,
      lbl: d.lbl ?? [], deps: d.deps ?? [], est: d.est ?? null, tt: d.tt ?? null,
      descr: d.descr ?? '', checklist: d.checklist ?? [], cf: d.cf ?? {},
      sectionId: d.sectionId ?? null, recurrence: d.recurrence ?? null, ord: d.ord ?? 0,
    },
  });
  if (d.a2?.length) await prisma.taskAssignee.createMany({ data: d.a2.map((u: string) => ({ taskId: created.id, userId: u })), skipDuplicates: true });
  if (d.watchers?.length) await prisma.taskWatcher.createMany({ data: d.watchers.map((u: string) => ({ taskId: created.id, userId: u })), skipDuplicates: true });
  const full = await prisma.task.findUnique({ where: { id: created.id }, include: { assignees: true, watchers: true, homes: true } });
  emit(ws, 'task.created', { task: taskDTO(full), taskId: created.id }, req.user!.id);
  logAudit(ws, req.user!.id, 'task.created', created.id, {});
  res.json(taskDTO(full));
}));

app.patch('/api/tasks/:id', requireAuth, h(async (req, res) => {
  const p = taskPatch.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const ws = await workspaceOfTask(req.params.id);
  await assertCan(req.user!.id, ws, 'MEMBER');
  const cur = await prisma.task.findUnique({ where: { id: req.params.id }, select: { s: true, e: true, projectId: true } });
  const d = normDates({ ...(p.data as any) }, cur ?? undefined);
  if ('par' in d && d.par) {
    // reject cross-project parents and parent cycles (task under its own descendant)
    const parent = await prisma.task.findUnique({ where: { id: d.par }, select: { projectId: true, parentId: true } });
    if (!parent || parent.projectId !== cur?.projectId) throw new HttpError(400, 'parent task must be in the same project');
    let walk: string | null = d.par;
    for (let hops = 0; walk && hops < 100; hops++) {
      if (walk === req.params.id) throw new HttpError(400, 'cannot move a task under its own subtree');
      const up: { parentId: string | null } | null = await prisma.task.findUnique({ where: { id: walk }, select: { parentId: true } });
      walk = up?.parentId ?? null;
    }
  }
  const stChanged = 'st' in d && d.st !== (await prisma.task.findUnique({ where: { id: req.params.id }, select: { st: true } }))?.st;
  const data: any = {};
  for (const k of ['name', 'pr', 'pg', 'st', 's', 'e', 'bs', 'be', 'ms', 'crit', 'est', 'tt', 'descr', 'checklist', 'cf', 'sectionId', 'recurrence', 'ord']) if (k in d) data[k] = d[k];
  if ('a' in d) data.assigneeId = d.a;
  if ('par' in d) data.parentId = d.par;
  if ('lbl' in d) data.lbl = d.lbl;
  if ('deps' in d) data.deps = d.deps;
  const updated = await prisma.task.update({ where: { id: req.params.id }, data });
  if ('a2' in d) {
    await prisma.taskAssignee.deleteMany({ where: { taskId: updated.id } });
    if (d.a2?.length) await prisma.taskAssignee.createMany({ data: d.a2.map((u: string) => ({ taskId: updated.id, userId: u })), skipDuplicates: true });
  }
  if ('watchers' in d) {
    await prisma.taskWatcher.deleteMany({ where: { taskId: updated.id } });
    if (d.watchers?.length) await prisma.taskWatcher.createMany({ data: d.watchers.map((u: string) => ({ taskId: updated.id, userId: u })), skipDuplicates: true });
  }
  emit(ws, stChanged ? 'status.changed' : 'task.updated', { task: taskDTO(updated), taskId: updated.id, st: updated.st }, req.user!.id);
  if (updated.ms && updated.st === 'done') emit(ws, 'milestone.completed', { task: taskDTO(updated), taskId: updated.id }, req.user!.id);
  logAudit(ws, req.user!.id, stChanged ? 'task.status' : 'task.updated', updated.id, { fields: Object.keys(data), st: stChanged ? updated.st : undefined });
  if (stChanged && updated.st === 'done') notifyUnblocked({ id: updated.id, name: updated.name, projectId: updated.projectId }, ws, req.user!.id).catch(() => {});
  res.json(taskDTO(updated));
}));

app.delete('/api/tasks/:id', requireAuth, h(async (req, res) => {
  const ws = await workspaceOfTask(req.params.id);
  await assertCan(req.user!.id, ws, 'MANAGER');
  const target = await prisma.task.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
  if (!target) throw new HttpError(404, 'task not found');
  // Soft delete (→ trash) the whole descendant subtree; restorable for 30 days.
  const ids = new Set([req.params.id]);
  let frontier = [req.params.id];
  while (frontier.length) {
    const kids = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
    frontier = kids.map((k) => k.id).filter((id) => !ids.has(id));
    frontier.forEach((id) => ids.add(id));
  }
  const idArr = [...ids];
  await prisma.task.updateMany({ where: { id: { in: idArr } }, data: { deletedAt: new Date() } });
  emit(ws, 'task.deleted', { taskId: req.params.id, ids: idArr }, req.user!.id);
  res.json({ ok: true, deleted: idArr.length, trashed: true });
}));

const commentSchema = z.object({ txt: z.string().min(1).max(4000), parentId: z.string().nullish(), who: z.string().optional(), when: z.string().optional(), rx: z.array(z.any()).optional() });
app.post('/api/tasks/:id/comments', requireAuth, h(async (req, res) => {
  const p = commentSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const ws = await workspaceOfTask(req.params.id);
  await assertCan(req.user!.id, ws, 'MEMBER');
  const c = await prisma.comment.create({ data: { taskId: req.params.id, parentId: p.data.parentId ?? null, authorId: req.user!.id, whenTxt: p.data.when || 'Just now', txt: p.data.txt, rx: p.data.rx || [] } });
  // @mention notifications: match @name against workspace members
  const mentions = [...p.data.txt.matchAll(/@([\w.]+)/g)].map((m) => m[1].toLowerCase());
  if (mentions.length) {
    const members = await prisma.membership.findMany({ where: { workspaceId: ws }, include: { user: true } });
    for (const m of members) {
      const first = m.user.name.split(' ')[0].toLowerCase();
      if (m.userId !== req.user!.id && mentions.some((x) => first.startsWith(x) || m.user.name.toLowerCase().replace(/\s/g, '').includes(x))) {
        await prisma.notification.create({ data: { id: `n_${nanoid(8)}`, userId: m.userId, kind: 'mention', ic: '@', unread: true, whenTxt: 'just now', txt: `You were mentioned on a task`, ref: req.params.id, ord: -Math.floor(Date.now() / 1000) } });
      }
    }
  }
  emit(ws, 'comment.added', { taskId: req.params.id, comment: { id: c.id, who: c.authorId, txt: c.txt } }, req.user!.id);
  logAudit(ws, req.user!.id, 'comment.added', req.params.id, {});
  res.json({ id: c.id, who: c.authorId, when: c.whenTxt, txt: c.txt, rx: c.rx ?? [], parentId: c.parentId });
}));

// ---- projects ------------------------------------------------------------
const projectSchema = z.object({
  id: z.string().optional(), name: z.string().min(1).max(200), code: z.string().max(6).optional(),
  cat: z.string().optional(), ws: z.string(), owner: z.string().optional(), st: z.string().optional(),
  prog: z.number().int().min(0).max(100).optional(), due: z.number().int().nullish(), color: z.string().optional(),
});
app.post('/api/projects', requireAuth, h(async (req, res) => {
  const p = projectSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  await assertCan(req.user!.id, p.data.ws, 'MANAGER');
  const d = p.data;
  const created = await prisma.project.create({
    data: { id: nanoid(10), name: d.name, code: d.code || 'NP', categoryId: d.cat || 'dt', workspaceId: d.ws, ownerId: d.owner || req.user!.id, st: d.st || 'mut', prog: d.prog ?? 0, due: d.due ?? null, color: d.color || '#6366F1' },
  });
  res.json({ id: created.id, name: created.name, code: created.code, cat: created.categoryId, ws: created.workspaceId, owner: created.ownerId, st: created.st, prog: created.prog, due: created.due, color: created.color });
}));

// ---- inbox (own notifications only) --------------------------------------
app.patch('/api/inbox/:id', requireAuth, h(async (req, res) => {
  const n = await prisma.notification.findUnique({ where: { id: req.params.id } });
  if (!n || n.userId !== req.user!.id) throw new HttpError(404, 'not found');
  await prisma.notification.update({ where: { id: req.params.id }, data: { unread: !!req.body?.unread } });
  res.json({ ok: true });
}));
app.post('/api/inbox/read-all', requireAuth, h(async (req, res) => {
  await prisma.notification.updateMany({ where: { userId: req.user!.id }, data: { unread: false } });
  res.json({ ok: true });
}));

// ---- chat ----------------------------------------------------------------
const chatSchema = z.object({ txt: z.string().min(1).max(4000), who: z.string().optional(), when: z.string().optional(), ref: z.string().nullish() });
app.post('/api/chat/:chan/messages', requireAuth, h(async (req, res) => {
  const p = chatSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const chan = await prisma.chatChannel.findUnique({ where: { id: req.params.chan } });
  if (!chan) throw new HttpError(404, 'channel not found');
  if (chan.workspaceId) {
    await assertMember(req.user!.id, chan.workspaceId);
  } else {
    // DM channels are private to their participants
    const part = await prisma.chatChannelMember.findUnique({ where: { channelId_userId: { channelId: chan.id, userId: req.user!.id } } });
    if (!part) throw new HttpError(403, 'not a participant of this conversation');
  }
  const maxOrd = (await prisma.chatMessage.aggregate({ where: { channelId: chan.id }, _max: { ord: true } }))._max.ord ?? -1;
  const m = await prisma.chatMessage.create({ data: { channelId: chan.id, authorId: req.user!.id, whenTxt: p.data.when || 'Now', txt: p.data.txt, ref: p.data.ref ?? null, ord: maxOrd + 1 } });
  res.json({ id: m.id, who: m.authorId, when: m.whenTxt, txt: m.txt, ref: m.ref });
}));

// ---- workspaces ------------------------------------------------------------
const wsSchema = z.object({ name: z.string().min(1).max(80), color: z.string().max(20).optional() });
app.post('/api/workspaces', requireAuth, h(async (req, res) => {
  const p = wsSchema.safeParse(req.body);
  if (!p.success) return bad(res, p.error);
  const ini = p.data.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'W';
  const ws = await prisma.workspace.create({
    data: { id: `ws_${nanoid(8)}`, name: p.data.name, color: p.data.color || '#6366F1', ini, meta: '0 projects' },
  });
  await prisma.membership.create({ data: { userId: req.user!.id, workspaceId: ws.id, role: 'OWNER' } });
  res.json(ws);
}));

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Wave 2–5 route modules (tasks-extended, projects-extended, integrations, MCP,
// reports, 2FA/SSO/export, uploads, status updates, goals).
// ---- public read-only share page (token-gated, no auth) -------------------
app.get('/share/:token', h(async (req, res) => {
  const esc = (v: any) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c] as string));
  const proj = await prisma.project.findUnique({ where: { shareToken: req.params.token } });
  if (!proj || proj.deletedAt) return res.status(404).send('<h3 style="font-family:sans-serif">Link not found or disabled</h3>');
  const [tasks, sections] = await Promise.all([
    prisma.task.findMany({ where: { projectId: proj.id, deletedAt: null }, orderBy: [{ ord: 'asc' }, { createdAt: 'asc' }], include: { assignee: { select: { name: true } } } }),
    prisma.section.findMany({ where: { projectId: proj.id }, orderBy: { ord: 'asc' } }),
  ]);
  const iso = (n: number | null) => (n == null ? '—' : new Date(EP + n * 864e5).toISOString().slice(0, 10));
  const stLbl: Record<string, string> = { mut: 'Not started', prog: 'In progress', risk: 'At risk', bad: 'Off track', done: 'Done', ok: 'On track' };
  const stCol: Record<string, string> = { mut: '#71717A', prog: '#4F46E5', risk: '#D97706', bad: '#DC2626', done: '#059669', ok: '#059669' };
  const secName = Object.fromEntries(sections.map((x) => [x.id, x.name]));
  const rows = tasks.map((t) => `<tr>
    <td>${t.ms ? '◆ ' : ''}${esc(t.name)}</td>
    <td>${esc(t.sectionId ? secName[t.sectionId] || '' : '')}</td>
    <td>${esc(t.assignee?.name || '')}</td>
    <td><span class="pill" style="color:${stCol[t.st] || '#71717A'}">${esc(stLbl[t.st] || t.st)}</span></td>
    <td>${t.pg}%</td><td>${iso(t.s)}</td><td>${iso(t.e)}</td>
  </tr>`).join('');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(proj.name)} — Velox (read-only)</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;margin:0;background:#FAFAFA;color:#18181B}
  .wrap{max-width:900px;margin:0 auto;padding:28px 18px}
  .hd{display:flex;align-items:center;gap:10px;margin-bottom:4px}
  .code{width:30px;height:30px;border-radius:8px;background:${esc(proj.color)};color:#fff;display:grid;place-items:center;font-size:10px;font-weight:800}
  h1{font-size:20px;margin:0}.sub{color:#71717A;font-size:12.5px;margin-bottom:18px}
  .bar{height:8px;border-radius:99px;background:#E4E4E7;overflow:hidden;margin:10px 0 22px}
  .bar>div{height:100%;background:${esc(proj.color)}}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #E4E4E7;border-radius:12px;overflow:hidden;font-size:13px}
  th{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#A1A1AA;text-align:left;padding:9px 12px;border-bottom:1px solid #E4E4E7}
  td{padding:9px 12px;border-bottom:1px solid #F4F4F5}.pill{font-weight:700;font-size:11.5px}
  .ft{color:#A1A1AA;font-size:11px;margin-top:16px}
  @media(max-width:640px){td:nth-child(2),th:nth-child(2),td:nth-child(6),th:nth-child(6){display:none}}
</style></head><body><div class="wrap">
  <div class="hd"><span class="code">${esc(proj.code)}</span><h1>${esc(proj.name)}</h1></div>
  <div class="sub">Read-only shared view · status: ${esc(stLbl[proj.st] || proj.st)} · ${tasks.length} tasks</div>
  <div class="bar"><div style="width:${Math.max(0, Math.min(100, proj.prog))}%"></div></div>
  <table><thead><tr><th>Task</th><th>Section</th><th>Assignee</th><th>Status</th><th>%</th><th>Start</th><th>Due</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="ft">Shared via Velox — this link is view-only.</div>
</div></body></html>`);
}));

mountRoutes(app);

const server = createServer(app);
attachWs(server);
server.listen(PORT, () => {
  console.log(`Velox API (PostgreSQL) on http://localhost:${PORT}  · ws:/ws`);
  startSchedulers();
});
