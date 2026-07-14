// Wave 7: DB-backed goals (OKRs). A key result may link to a project, in which
// case its "current" value tracks the project's live progress automatically.
import type { Express } from 'express';
import { z } from 'zod';
import { prisma, requireAuth, h, bad, HttpError, assertCan, assertMember } from '../ctx.ts';

const krDTO = (k: any, pmap: Record<string, any>) => ({
  id: k.id, name: k.name, target: k.target,
  current: k.projectId && pmap[k.projectId] ? pmap[k.projectId].prog : k.current,
  pid: k.projectId ?? null, projName: k.projectId ? pmap[k.projectId]?.name ?? null : null,
});

async function wsOfGoal(goalId: string): Promise<string> {
  const g = await prisma.goal.findUnique({ where: { id: goalId }, select: { workspaceId: true } });
  if (!g) throw new HttpError(404, 'goal not found');
  return g.workspaceId;
}

export function registerGoalRoutes(app: Express) {
  app.get('/api/ws/:ws/goals', requireAuth, h(async (req: any, res) => {
    await assertMember(req.user.id, req.params.ws);
    const goals = await prisma.goal.findMany({ where: { workspaceId: req.params.ws }, orderBy: { ord: 'asc' }, include: { keyResults: true } });
    const pids = [...new Set(goals.flatMap((g) => g.keyResults.map((k) => k.projectId).filter(Boolean)))] as string[];
    const projs = pids.length ? await prisma.project.findMany({ where: { id: { in: pids } }, select: { id: true, prog: true, name: true } }) : [];
    const pmap: Record<string, any> = Object.fromEntries(projs.map((p) => [p.id, p]));
    res.json(goals.map((g) => ({ id: g.id, name: g.name, ord: g.ord, krs: g.keyResults.map((k) => krDTO(k, pmap)) })));
  }));

  app.post('/api/ws/:ws/goals', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.ws, 'MANAGER');
    const name = z.string().min(1).max(120).parse(req.body?.name);
    const max = (await prisma.goal.aggregate({ where: { workspaceId: req.params.ws }, _max: { ord: true } }))._max.ord ?? -1;
    const g = await prisma.goal.create({ data: { workspaceId: req.params.ws, name, ord: max + 1 } });
    res.json({ id: g.id, name: g.name, ord: g.ord, krs: [] });
  }));

  app.patch('/api/goals/:id', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await wsOfGoal(req.params.id), 'MANAGER');
    const data: any = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 120);
    if (typeof req.body?.ord === 'number') data.ord = req.body.ord;
    const g = await prisma.goal.update({ where: { id: req.params.id }, data });
    res.json({ id: g.id, name: g.name, ord: g.ord });
  }));

  app.delete('/api/goals/:id', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await wsOfGoal(req.params.id), 'MANAGER');
    await prisma.goal.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  const krSchema = z.object({ name: z.string().min(1).max(160), target: z.number().int().min(1).max(1000000).optional(), pid: z.string().nullish() });
  app.post('/api/goals/:id/krs', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await wsOfGoal(req.params.id), 'MANAGER');
    const p = krSchema.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const k = await prisma.keyResult.create({ data: { goalId: req.params.id, name: p.data.name, target: p.data.target ?? 100, projectId: p.data.pid ?? null } });
    const proj = k.projectId ? await prisma.project.findUnique({ where: { id: k.projectId }, select: { id: true, prog: true, name: true } }) : null;
    res.json(krDTO(k, proj ? { [proj.id]: proj } : {}));
  }));

  app.patch('/api/krs/:id', requireAuth, h(async (req: any, res) => {
    const kr = await prisma.keyResult.findUnique({ where: { id: req.params.id }, select: { goalId: true } });
    if (!kr) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await wsOfGoal(kr.goalId), 'MANAGER');
    const data: any = {};
    if (typeof req.body?.name === 'string' && req.body.name.trim()) data.name = req.body.name.trim().slice(0, 160);
    if (typeof req.body?.target === 'number') data.target = Math.max(1, Math.round(req.body.target));
    if (typeof req.body?.current === 'number') data.current = Math.max(0, Math.round(req.body.current));
    if ('pid' in (req.body || {})) data.projectId = req.body.pid || null;
    const k = await prisma.keyResult.update({ where: { id: req.params.id }, data });
    const proj = k.projectId ? await prisma.project.findUnique({ where: { id: k.projectId }, select: { id: true, prog: true, name: true } }) : null;
    res.json(krDTO(k, proj ? { [proj.id]: proj } : {}));
  }));

  app.delete('/api/krs/:id', requireAuth, h(async (req: any, res) => {
    const kr = await prisma.keyResult.findUnique({ where: { id: req.params.id }, select: { goalId: true } });
    if (!kr) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await wsOfGoal(kr.goalId), 'MANAGER');
    await prisma.keyResult.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));
}
