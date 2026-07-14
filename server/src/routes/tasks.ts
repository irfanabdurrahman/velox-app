import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma, requireAuth, h, bad, HttpError, assertCan, workspaceOfTask, workspaceOfProject, accessibleWorkspaceIds, assertMember } from '../ctx.ts';
import { taskDTO } from '../index.ts';
import { emit } from '../events.ts';

export function registerTaskRoutes(app: Express) {
  // ---- trash / restore ----------------------------------------------------
  app.get('/api/trash', requireAuth, h(async (req: any, res) => {
    const wsIds = await accessibleWorkspaceIds(req.user.id);
    const rows = await prisma.task.findMany({
      where: { deletedAt: { not: null }, project: { workspaceId: { in: wsIds } } },
      orderBy: { deletedAt: 'desc' }, take: 200,
      include: { project: { select: { name: true } } },
    });
    res.json(rows.map((t) => ({ ...taskDTO(t), projectName: t.project.name, deletedAt: t.deletedAt })));
  }));

  // ---- per-task activity log (from the workspace audit trail) -------------
  app.get('/api/tasks/:id/activity', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfTask(req.params.id);
    await assertMember(req.user.id, ws);
    const rows = await prisma.auditLog.findMany({
      where: { workspaceId: ws, target: req.params.id },
      orderBy: { createdAt: 'desc' }, take: 50,
      include: { actor: { select: { name: true, initials: true, color: true } } },
    });
    res.json(rows.map((r) => ({ id: r.id, action: r.action, meta: r.meta, when: r.createdAt, actor: r.actor ? { n: r.actor.name, ini: r.actor.initials, c: r.actor.color } : null })));
  }));

  app.post('/api/tasks/:id/restore', requireAuth, h(async (req: any, res) => {
    const t = await prisma.task.findUnique({ where: { id: req.params.id }, select: { projectId: true, parentId: true } });
    if (!t) throw new HttpError(404, 'not found');
    const ws = await workspaceOfProject(t.projectId);
    await assertCan(req.user.id, ws, 'MANAGER');
    // restore the subtree
    const ids = new Set([req.params.id]);
    let frontier = [req.params.id];
    while (frontier.length) {
      const kids = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
      frontier = kids.map((k) => k.id).filter((id) => !ids.has(id));
      frontier.forEach((id) => ids.add(id));
    }
    await prisma.task.updateMany({ where: { id: { in: [...ids] } }, data: { deletedAt: null } });
    // if the parent is gone, promote to root
    if (t.parentId) { const p = await prisma.task.findUnique({ where: { id: t.parentId } }); if (!p || p.deletedAt) await prisma.task.update({ where: { id: req.params.id }, data: { parentId: null } }); }
    const restored = await prisma.task.findUnique({ where: { id: req.params.id } });
    emit(ws, 'task.created', { task: taskDTO(restored), taskId: req.params.id }, req.user.id);
    res.json({ ok: true, restored: ids.size });
  }));

  app.delete('/api/tasks/:id/purge', requireAuth, h(async (req: any, res) => {
    const t = await prisma.task.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
    if (!t) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await workspaceOfProject(t.projectId), 'MANAGER');
    // collect the full subtree, strip dangling deps on remaining siblings, then hard-delete
    const ids = new Set([req.params.id]);
    let frontier = [req.params.id];
    while (frontier.length) {
      const kids = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
      frontier = kids.map((k) => k.id).filter((id) => !ids.has(id));
      frontier.forEach((id) => ids.add(id));
    }
    const idArr = [...ids];
    const siblings = await prisma.task.findMany({ where: { projectId: t.projectId, id: { notIn: idArr } }, select: { id: true, deps: true } });
    const fixes = siblings.filter((x) => ((x.deps as any[]) || []).some((d: any) => ids.has(d.t)))
      .map((x) => prisma.task.update({ where: { id: x.id }, data: { deps: ((x.deps as any[]) || []).filter((d: any) => !ids.has(d.t)) } }));
    await prisma.$transaction([...fixes, prisma.task.deleteMany({ where: { id: { in: idArr } } })]);
    res.json({ ok: true, purged: idArr.length });
  }));

  // ---- duplicate ----------------------------------------------------------
  app.post('/api/tasks/:id/duplicate', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfTask(req.params.id);
    await assertCan(req.user.id, ws, 'MEMBER');
    const src = await prisma.task.findUnique({ where: { id: req.params.id }, include: { subtasks: true } });
    if (!src) throw new HttpError(404, 'not found');
    const copy = async (t: any, parentId: string | null): Promise<string> => {
      const id = nanoid(10);
      await prisma.task.create({ data: {
        id, projectId: t.projectId, parentId, name: parentId ? t.name : t.name + ' (copy)', assigneeId: t.assigneeId,
        pr: t.pr, pg: t.pg, st: t.st, s: t.s, e: t.e, ms: t.ms, crit: t.crit, lbl: t.lbl, deps: [], est: t.est,
        descr: t.descr, checklist: t.checklist, cf: t.cf, sectionId: t.sectionId, recurrence: t.recurrence,
      } });
      const kids = await prisma.task.findMany({ where: { parentId: t.id, deletedAt: null } });
      for (const k of kids) await copy(k, id);
      return id;
    };
    const newId = await copy(src, src.parentId);
    const created = await prisma.task.findUnique({ where: { id: newId } });
    emit(ws, 'task.created', { task: taskDTO(created), taskId: newId }, req.user.id);
    res.json(taskDTO(created));
  }));

  // ---- convert: task→subtask (set parent), subtask→task (clear parent) -----
  const convSchema = z.object({ parentId: z.string().nullable() });
  app.post('/api/tasks/:id/convert', requireAuth, h(async (req: any, res) => {
    const p = convSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const ws = await workspaceOfTask(req.params.id);
    await assertCan(req.user.id, ws, 'MEMBER');
    const cur = await prisma.task.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
    if (p.data.parentId) {
      const parent = await prisma.task.findUnique({ where: { id: p.data.parentId }, select: { projectId: true } });
      if (!parent || parent.projectId !== cur?.projectId) throw new HttpError(400, 'parent must be in the same project');
      // cycle guard
      let walk: string | null = p.data.parentId;
      for (let i = 0; walk && i < 100; i++) { if (walk === req.params.id) throw new HttpError(400, 'would create a cycle'); walk = (await prisma.task.findUnique({ where: { id: walk }, select: { parentId: true } }))?.parentId ?? null; }
    }
    const updated = await prisma.task.update({ where: { id: req.params.id }, data: { parentId: p.data.parentId } });
    emit(ws, 'task.updated', { task: taskDTO(updated), taskId: updated.id }, req.user.id);
    res.json(taskDTO(updated));
  }));

  // ---- bulk edit ----------------------------------------------------------
  const bulkSchema = z.object({
    ids: z.array(z.string()).min(1).max(500),
    patch: z.object({ st: z.string().optional(), pr: z.string().optional(), a: z.string().nullish(), pg: z.number().int().min(0).max(100).optional(), sectionId: z.string().nullish() }),
    del: z.boolean().optional(),
  });
  app.post('/api/tasks/bulk', requireAuth, h(async (req: any, res) => {
    const p = bulkSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    // authorize per distinct workspace
    const rows = await prisma.task.findMany({ where: { id: { in: p.data.ids } }, select: { id: true, project: { select: { workspaceId: true } } } });
    const wsSet = new Set(rows.map((r) => r.project.workspaceId));
    for (const ws of wsSet) await assertCan(req.user.id, ws, p.data.del ? 'MANAGER' : 'MEMBER');
    if (p.data.del) {
      await prisma.task.updateMany({ where: { id: { in: p.data.ids } }, data: { deletedAt: new Date() } });
    } else {
      const data: any = {};
      const pc = p.data.patch;
      for (const k of ['st', 'pr', 'pg', 'sectionId'] as const) if (k in pc) (data as any)[k] = (pc as any)[k];
      if ('a' in pc) data.assigneeId = pc.a;
      await prisma.task.updateMany({ where: { id: { in: p.data.ids } }, data });
    }
    for (const ws of wsSet) emit(ws, 'task.updated', { bulk: true }, req.user.id);
    res.json({ ok: true, count: p.data.ids.length });
  }));

  // ---- multi-homing: link/unlink a task to another project ----------------
  app.post('/api/tasks/:id/homes', requireAuth, h(async (req: any, res) => {
    const projectId = z.string().parse(req.body?.projectId);
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'MEMBER');
    await assertCan(req.user.id, await workspaceOfProject(projectId), 'MEMBER');
    await prisma.taskProject.upsert({ where: { taskId_projectId: { taskId: req.params.id, projectId } }, create: { taskId: req.params.id, projectId }, update: {} });
    res.json({ ok: true });
  }));
  app.delete('/api/tasks/:id/homes/:pid', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'MEMBER');
    await prisma.taskProject.deleteMany({ where: { taskId: req.params.id, projectId: req.params.pid } });
    res.json({ ok: true });
  }));

  // ---- time tracking ------------------------------------------------------
  const timeSchema = z.object({ minutes: z.number().int().min(1).max(24 * 60), note: z.string().max(300).optional(), day: z.number().int() });
  app.post('/api/tasks/:id/time', requireAuth, h(async (req: any, res) => {
    const p = timeSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'MEMBER');
    const entry = await prisma.timeEntry.create({ data: { taskId: req.params.id, userId: req.user.id, minutes: p.data.minutes, note: p.data.note || '', day: p.data.day } });
    // update rolled-up tt label
    const agg = await prisma.timeEntry.aggregate({ where: { taskId: req.params.id }, _sum: { minutes: true } });
    const total = agg._sum.minutes || 0;
    await prisma.task.update({ where: { id: req.params.id }, data: { tt: `${Math.floor(total / 60)}h ${total % 60}m` } });
    res.json({ id: entry.id, minutes: entry.minutes, day: entry.day, total });
  }));
  app.get('/api/tasks/:id/time', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'MEMBER');
    const rows = await prisma.timeEntry.findMany({ where: { taskId: req.params.id }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map((r) => ({ id: r.id, user: r.userId, minutes: r.minutes, note: r.note, day: r.day })));
  }));

  // ---- threaded comment detail (returns tree) -----------------------------
  app.get('/api/tasks/:id/comments', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'GUEST' as any).catch(() => {});
    const rows = await prisma.comment.findMany({ where: { taskId: req.params.id }, orderBy: { createdAt: 'asc' } });
    res.json(rows.map((c) => ({ id: c.id, who: c.authorId, when: c.whenTxt, txt: c.txt, rx: c.rx ?? [], parentId: c.parentId })));
  }));

  // ---- reaction toggle on a comment ---------------------------------------
  const rxSchema = z.object({ emoji: z.string().min(1).max(8) });
  app.post('/api/comments/:id/react', requireAuth, h(async (req: any, res) => {
    const p = rxSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const c = await prisma.comment.findUnique({ where: { id: req.params.id }, include: { task: { select: { project: { select: { workspaceId: true } } } } } });
    if (!c) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, c.task.project.workspaceId, 'MEMBER');
    // rx stored as [[emoji, [userIds]]]
    const rx: [string, string[]][] = (c.rx as any) || [];
    let row = rx.find((r) => r[0] === p.data.emoji);
    if (!row) { row = [p.data.emoji, []]; rx.push(row); }
    const i = row[1].indexOf(req.user.id);
    if (i >= 0) row[1].splice(i, 1); else row[1].push(req.user.id);
    const cleaned = rx.filter((r) => r[1].length);
    await prisma.comment.update({ where: { id: req.params.id }, data: { rx: cleaned } });
    res.json({ id: c.id, rx: cleaned });
  }));
}
