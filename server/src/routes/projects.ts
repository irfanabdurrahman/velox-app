import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma, requireAuth, h, bad, HttpError, assertCan, assertMember, workspaceOfProject, EP } from '../ctx.ts';
import { emit } from '../events.ts';
import { buildGanttXlsx } from '../xlsxGantt.ts';

const projDTO = (p: any) => ({ id: p.id, name: p.name, code: p.code, cat: p.categoryId, ws: p.workspaceId, owner: p.ownerId, st: p.st, prog: p.prog, due: p.due, color: p.color, privacy: p.privacy, archived: p.archived, shareToken: p.shareToken ?? null });

export function registerProjectRoutes(app: Express) {
  // ---- quick-add inbox: per-workspace holding project ("Belum diatur") ----
  // Identified by code INBX; created lazily so any MEMBER can quick-add without
  // needing MANAGER rights or a pre-existing project.
  app.post('/api/ws/:ws/inbox-project', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.ws, 'MEMBER');
    const found = await prisma.project.findFirst({ where: { workspaceId: req.params.ws, code: 'INBX', deletedAt: null, isTemplate: false, archived: false } });
    if (found) return res.json(projDTO(found));
    const created = await prisma.project.create({
      data: { id: nanoid(10), name: 'Belum diatur', code: 'INBX', workspaceId: req.params.ws, ownerId: req.user.id, st: 'mut', prog: 0, color: '#64748B' },
    });
    res.json(projDTO(created));
  }));

  // ---- sections -----------------------------------------------------------
  app.post('/api/projects/:pid/sections', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfProject(req.params.pid), 'MEMBER');
    const name = z.string().min(1).max(80).parse(req.body?.name);
    const max = (await prisma.section.aggregate({ where: { projectId: req.params.pid }, _max: { ord: true } }))._max.ord ?? -1;
    const s = await prisma.section.create({ data: { projectId: req.params.pid, name, ord: max + 1 } });
    res.json({ id: s.id, pid: s.projectId, name: s.name, ord: s.ord });
  }));
  app.patch('/api/sections/:id', requireAuth, h(async (req: any, res) => {
    const sec = await prisma.section.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
    if (!sec) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await workspaceOfProject(sec.projectId), 'MEMBER');
    const data: any = {};
    if (typeof req.body?.name === 'string') data.name = req.body.name.slice(0, 80);
    if (typeof req.body?.ord === 'number') data.ord = req.body.ord;
    const s = await prisma.section.update({ where: { id: req.params.id }, data });
    res.json({ id: s.id, pid: s.projectId, name: s.name, ord: s.ord });
  }));
  app.delete('/api/sections/:id', requireAuth, h(async (req: any, res) => {
    const sec = await prisma.section.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
    if (!sec) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await workspaceOfProject(sec.projectId), 'MANAGER');
    await prisma.task.updateMany({ where: { sectionId: req.params.id }, data: { sectionId: null } });
    await prisma.section.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  // ---- custom fields ------------------------------------------------------
  const cfSchema = z.object({ name: z.string().min(1).max(60), kind: z.enum(['text', 'number', 'dropdown', 'date', 'people', 'currency', 'formula']), config: z.record(z.string(), z.any()).optional() });
  app.post('/api/projects/:pid/fields', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfProject(req.params.pid), 'MANAGER');
    const p = cfSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const max = (await prisma.customField.aggregate({ where: { projectId: req.params.pid }, _max: { ord: true } }))._max.ord ?? -1;
    const f = await prisma.customField.create({ data: { projectId: req.params.pid, name: p.data.name, kind: p.data.kind, config: p.data.config || {}, ord: max + 1 } });
    res.json({ id: f.id, pid: f.projectId, name: f.name, kind: f.kind, config: f.config, ord: f.ord });
  }));
  app.delete('/api/fields/:id', requireAuth, h(async (req: any, res) => {
    const f = await prisma.customField.findUnique({ where: { id: req.params.id }, select: { projectId: true } });
    if (!f) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await workspaceOfProject(f.projectId), 'MANAGER');
    await prisma.customField.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  // ---- weekly status update ----------------------------------------------
  const suSchema = z.object({ status: z.enum(['ok', 'risk', 'bad']), summary: z.string().min(1).max(2000) });
  app.post('/api/projects/:pid/status', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertCan(req.user.id, ws, 'MEMBER');
    const p = suSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const su = await prisma.statusUpdate.create({ data: { projectId: req.params.pid, authorId: req.user.id, status: p.data.status, summary: p.data.summary } });
    // update the project's rolled-up status so the exec dashboard reflects it
    await prisma.project.update({ where: { id: req.params.pid }, data: { st: p.data.status } });
    emit(ws, p.data.status === 'ok' ? 'status_update.posted' : 'project.at_risk', { projectId: req.params.pid, status: p.data.status, summary: p.data.summary }, req.user.id);
    res.json({ id: su.id, pid: su.projectId, author: su.authorId, status: su.status, summary: su.summary, when: su.createdAt });
  }));

  // ---- privacy / archive / project patch ----------------------------------
  const projPatch = z.object({ name: z.string().max(200).optional(), privacy: z.enum(['workspace', 'private', 'hidden']).optional(), archived: z.boolean().optional(), color: z.string().max(20).optional(), cat: z.string().optional(), owner: z.string().nullish(), due: z.number().int().nullish() });
  app.patch('/api/projects/:pid', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfProject(req.params.pid), 'MANAGER');
    const p = projPatch.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const data: any = {};
    for (const k of ['name', 'privacy', 'archived', 'color', 'due'] as const) if (k in p.data) (data as any)[k] = (p.data as any)[k];
    if ('cat' in p.data) data.categoryId = p.data.cat;
    if ('owner' in p.data) data.ownerId = p.data.owner;
    const pr = await prisma.project.update({ where: { id: req.params.pid }, data });
    res.json({ id: pr.id, name: pr.name, code: pr.code, cat: pr.categoryId, ws: pr.workspaceId, owner: pr.ownerId, st: pr.st, prog: pr.prog, due: pr.due, color: pr.color, privacy: pr.privacy, archived: pr.archived });
  }));

  // ---- delete a whole project (soft -> trash for 30 days; ?hard=1 purges) --
  app.delete('/api/projects/:pid', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertCan(req.user.id, ws, 'ADMIN');
    if (req.query.hard === '1') {
      const pr = await prisma.project.delete({ where: { id: req.params.pid } });
      emit(ws, 'project.deleted', { projectId: pr.id, name: pr.name, hard: true }, req.user.id);
      return res.json({ ok: true });
    }
    const pr = await prisma.project.update({ where: { id: req.params.pid }, data: { deletedAt: new Date(), shareToken: null } });
    emit(ws, 'project.deleted', { projectId: pr.id, name: pr.name }, req.user.id);
    res.json({ ok: true });
  }));
  app.post('/api/projects/:pid/restore', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertCan(req.user.id, ws, 'ADMIN');
    const pr = await prisma.project.update({ where: { id: req.params.pid }, data: { deletedAt: null } });
    res.json(projDTO(pr));
  }));

  // ---- trashed / archived project listings (Trash screen) ------------------
  app.get('/api/ws/:ws/trash-projects', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.ws, 'MANAGER');
    const rows = await prisma.project.findMany({ where: { workspaceId: req.params.ws, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } });
    res.json(rows.map((p) => ({ ...projDTO(p), deletedAt: p.deletedAt })));
  }));
  app.get('/api/ws/:ws/archived-projects', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.ws, 'MANAGER');
    const rows = await prisma.project.findMany({ where: { workspaceId: req.params.ws, archived: true, deletedAt: null }, orderBy: { name: 'asc' } });
    res.json(rows.map(projDTO));
  }));

  // ---- public read-only share link -----------------------------------------
  app.post('/api/projects/:pid/share', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertCan(req.user.id, ws, 'MANAGER');
    const token = req.body?.on ? nanoid(24) : null;
    const pr = await prisma.project.update({ where: { id: req.params.pid }, data: { shareToken: token } });
    res.json({ token: pr.shareToken });
  }));

  // ---- CSV export -----------------------------------------------------------
  app.get('/api/projects/:pid/export.csv', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertMember(req.user.id, ws);
    const [proj, tasks, sections, users] = await Promise.all([
      prisma.project.findUnique({ where: { id: req.params.pid } }),
      prisma.task.findMany({ where: { projectId: req.params.pid, deletedAt: null }, orderBy: [{ ord: 'asc' }, { createdAt: 'asc' }] }),
      prisma.section.findMany({ where: { projectId: req.params.pid } }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    if (!proj) throw new HttpError(404, 'not found');
    const secName = Object.fromEntries(sections.map((x) => [x.id, x.name]));
    const uName = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const iso = (n: number | null) => (n == null ? '' : new Date(EP + n * 864e5).toISOString().slice(0, 10));
    const esc = (v: any) => { const t = v == null ? '' : String(v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
    const head = ['Task', 'Section', 'Assignee', 'Status', 'Priority', 'Progress %', 'Start', 'Due', 'Milestone', 'Estimate'];
    const lines = [head.join(',')];
    for (const t of tasks) {
      lines.push([t.name, t.sectionId ? secName[t.sectionId] || '' : '', t.assigneeId ? uName[t.assigneeId] || t.assigneeId : '', t.st, t.pr, t.pg, iso(t.s), iso(t.e), t.ms ? 'yes' : '', t.est || ''].map(esc).join(','));
    }
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${proj.code || 'project'}-export.csv"`);
    res.send('\ufeff' + lines.join('\n'));
  }));

  // ---- rich Gantt-chart Excel export ---------------------------------------
  app.get('/api/projects/:pid/export.xlsx', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertMember(req.user.id, ws);
    const [proj, tasks, users] = await Promise.all([
      prisma.project.findUnique({ where: { id: req.params.pid } }),
      prisma.task.findMany({ where: { projectId: req.params.pid, deletedAt: null }, orderBy: [{ ord: 'asc' }, { createdAt: 'asc' }] }),
      prisma.user.findMany({ select: { id: true, name: true } }),
    ]);
    if (!proj) throw new HttpError(404, 'not found');
    const uName = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const buf = await buildGanttXlsx(
      { name: proj.name, code: proj.code, color: proj.color },
      tasks.map((t) => ({ id: t.id, name: t.name, parentId: t.parentId, assigneeId: t.assigneeId, pr: t.pr, pg: t.pg, st: t.st, s: t.s, e: t.e, ms: t.ms, crit: t.crit, ord: t.ord ?? 0, createdAt: t.createdAt })),
      uName,
    );
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${(proj.code || 'project')}-gantt.xlsx"`);
    res.send(buf);
  }));

  // ---- duplicate a whole project (optionally as template) -----------------
  app.post('/api/projects/:pid/duplicate', requireAuth, h(async (req: any, res) => {
    const ws = await workspaceOfProject(req.params.pid);
    await assertCan(req.user.id, ws, 'MANAGER');
    const src = await prisma.project.findUnique({ where: { id: req.params.pid }, include: { tasks: { where: { deletedAt: null } }, sections: true, customFields: true } });
    if (!src) throw new HttpError(404, 'not found');
    const newPid = nanoid(10);
    const asTemplate = !!req.body?.asTemplate;
    await prisma.project.create({ data: { id: newPid, name: (req.body?.name || src.name + (asTemplate ? ' (template)' : ' (copy)')).slice(0, 200), code: src.code, workspaceId: ws, categoryId: src.categoryId, ownerId: req.user.id, color: src.color, privacy: src.privacy, isTemplate: asTemplate } });
    const secMap: Record<string, string> = {};
    for (const s of src.sections) { const ns = await prisma.section.create({ data: { projectId: newPid, name: s.name, ord: s.ord } }); secMap[s.id] = ns.id; }
    for (const f of src.customFields) await prisma.customField.create({ data: { projectId: newPid, name: f.name, kind: f.kind, config: f.config as any, ord: f.ord } });
    const idMap: Record<string, string> = {};
    // copy roots first, then children (2 passes by depth)
    const byDepth = [...src.tasks].sort((a, b) => (a.parentId ? 1 : 0) - (b.parentId ? 1 : 0));
    for (const t of byDepth) {
      const nid = nanoid(10); idMap[t.id] = nid;
      await prisma.task.create({ data: {
        id: nid, projectId: newPid, parentId: t.parentId ? idMap[t.parentId] ?? null : null,
        name: t.name, assigneeId: t.assigneeId, pr: t.pr, pg: 0, st: 'mut', s: t.s, e: t.e, ms: t.ms, crit: t.crit,
        lbl: t.lbl as any, deps: [], est: t.est, descr: t.descr, checklist: t.checklist as any,
        sectionId: t.sectionId ? secMap[t.sectionId] ?? null : null, recurrence: t.recurrence,
      } });
    }
    const created = await prisma.project.findUnique({ where: { id: newPid } });
    res.json({ id: created!.id, name: created!.name, code: created!.code, cat: created!.categoryId, ws: created!.workspaceId, owner: created!.ownerId, st: created!.st, prog: created!.prog, due: created!.due, color: created!.color });
  }));
}
