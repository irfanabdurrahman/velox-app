// B6 public REST API — authenticated by API KEY (not JWT), scoped to the key's
// workspace, with per-scope authorization and its own per-key rate limit.
// All routes live under /api/v1. Auth: `Authorization: Bearer vlx_live_...`.
import express from 'express';
import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import rateLimit from 'express-rate-limit';
import { prisma, h, bad, HttpError, todayIdx } from '../ctx.ts';
import { apiKeyAuth, requireScope } from '../apikey.ts';
import { taskDTO } from '../index.ts';
import { emit } from '../events.ts';

// Clean external DTOs — stable field names for third-party consumers.
const apiProject = (p: any) => ({ id: p.id, name: p.name, code: p.code, status: p.st, progress: p.prog, due: p.due, color: p.color, archived: p.archived });
const apiTask = (t: any) => ({ id: t.id, projectId: t.projectId, name: t.name, status: t.st, priority: t.pr, progress: t.pg, assigneeId: t.assigneeId, start: t.s, due: t.e, milestone: t.ms, createdAt: t.createdAt, updatedAt: t.updatedAt });

export function registerPublicApi(app: Express) {
  const v1 = express.Router();
  // Dedicated limiter, keyed by the API key id: 600 requests / minute.
  const limiter = rateLimit({ windowMs: 60_000, max: 600, standardHeaders: true, legacyHeaders: false, keyGenerator: (req: any) => req.apiKeyId });
  v1.use(apiKeyAuth); // sets req.workspaceId / req.scopes / req.apiKeyId (401 if invalid)
  v1.use(limiter);

  // ---- projects ----------------------------------------------------------
  v1.get('/projects', requireScope('projects:read'), h(async (req: any, res) => {
    const rows = await prisma.project.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(apiProject));
  }));

  // ---- tasks -------------------------------------------------------------
  v1.get('/tasks', requireScope('tasks:read'), h(async (req: any, res) => {
    const where: any = { project: { workspaceId: req.workspaceId }, deletedAt: null };
    if (req.query.projectId) where.projectId = String(req.query.projectId);
    if (req.query.status) where.st = String(req.query.status);
    const rows = await prisma.task.findMany({ where, orderBy: [{ ord: 'asc' }, { createdAt: 'asc' }], take: 500 });
    res.json(rows.map(apiTask));
  }));

  const createSchema = z.object({ projectId: z.string(), name: z.string().min(1).max(300), assigneeId: z.string().nullish(), due: z.number().int().nullish() });
  v1.post('/tasks', requireScope('tasks:write'), h(async (req: any, res) => {
    const p = createSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const proj = await prisma.project.findUnique({ where: { id: p.data.projectId }, select: { workspaceId: true } });
    if (!proj || proj.workspaceId !== req.workspaceId) throw new HttpError(404, 'project not found in this workspace');
    const task = await prisma.task.create({ data: { id: nanoid(10), projectId: p.data.projectId, name: p.data.name, assigneeId: p.data.assigneeId ?? null, e: p.data.due ?? null, st: 'mut', pr: 'med' } });
    emit(req.workspaceId, 'task.created', { task: taskDTO(task), taskId: task.id });
    res.json(apiTask(task));
  }));

  const patchSchema = z.object({ name: z.string().min(1).max(300).optional(), status: z.string().optional(), assigneeId: z.string().nullish(), due: z.number().int().nullish(), progress: z.number().int().min(0).max(100).optional() });
  v1.patch('/tasks/:id', requireScope('tasks:write'), h(async (req: any, res) => {
    const p = patchSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const cur = await prisma.task.findUnique({ where: { id: req.params.id }, select: { st: true, project: { select: { workspaceId: true } } } });
    if (!cur || cur.project.workspaceId !== req.workspaceId) throw new HttpError(404, 'task not found in this workspace');
    const data: any = {};
    if (p.data.name !== undefined) data.name = p.data.name;
    if (p.data.status !== undefined) data.st = p.data.status;
    if (p.data.assigneeId !== undefined) data.assigneeId = p.data.assigneeId;
    if (p.data.due !== undefined) data.e = p.data.due;
    if (p.data.progress !== undefined) data.pg = p.data.progress;
    const updated = await prisma.task.update({ where: { id: req.params.id }, data });
    const stChanged = p.data.status !== undefined && p.data.status !== cur.st;
    emit(req.workspaceId, stChanged ? 'status.changed' : 'task.updated', { task: taskDTO(updated), taskId: updated.id, st: updated.st });
    res.json(apiTask(updated));
  }));

  const commentSchema = z.object({ text: z.string().min(1).max(4000) });
  v1.post('/tasks/:id/comments', requireScope('tasks:write'), h(async (req: any, res) => {
    const p = commentSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const t = await prisma.task.findUnique({ where: { id: req.params.id }, select: { project: { select: { workspaceId: true } } } });
    if (!t || t.project.workspaceId !== req.workspaceId) throw new HttpError(404, 'task not found in this workspace');
    const c = await prisma.comment.create({ data: { taskId: req.params.id, authorId: null, whenTxt: 'via API', txt: p.data.text, rx: [] } });
    emit(req.workspaceId, 'comment.added', { taskId: req.params.id, comment: { id: c.id, who: null, txt: c.txt } });
    res.json({ id: c.id, taskId: req.params.id, text: c.txt, createdAt: c.createdAt });
  }));

  // ---- reports -----------------------------------------------------------
  v1.get('/reports/overdue', requireScope('reports:read'), h(async (req: any, res) => {
    const today = todayIdx();
    const rows = await prisma.task.findMany({
      where: { project: { workspaceId: req.workspaceId }, deletedAt: null, st: { not: 'done' }, e: { lt: today } },
      include: { project: { select: { name: true } } }, orderBy: { e: 'asc' }, take: 500,
    });
    res.json({ asOf: today, count: rows.length, tasks: rows.map((t) => ({ id: t.id, name: t.name, projectId: t.projectId, projectName: t.project.name, due: t.e, daysOverdue: today - (t.e as number), status: t.st, assigneeId: t.assigneeId })) });
  }));

  v1.get('/reports/risk', requireScope('reports:read'), h(async (req: any, res) => {
    const rows = await prisma.project.findMany({ where: { workspaceId: req.workspaceId, archived: false, st: { in: ['risk', 'bad'] } }, orderBy: { prog: 'asc' } });
    res.json({ count: rows.length, projects: rows.map((p) => ({ id: p.id, name: p.name, code: p.code, status: p.st, progress: p.prog, due: p.due, ownerId: p.ownerId })) });
  }));

  app.use('/api/v1', v1);
}
