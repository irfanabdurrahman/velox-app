// Workspace-scoped, user-managed project categories (portfolios). Replaces the
// old fixed global 5-category list — every workspace now owns its own set,
// created/renamed/deleted like any other workspace resource.
import type { Express } from 'express';
import { z } from 'zod';
import { prisma, requireAuth, h, bad, HttpError, assertCan, assertMember } from '../ctx.ts';

const catDTO = (c: any) => ({ id: c.id, label: c.label, color: c.color, ord: c.ord, ws: c.workspaceId });

export function registerCategoryRoutes(app: Express) {
  const catCreate = z.object({ label: z.string().min(1).max(60), color: z.string().max(20).optional() });
  app.post('/api/ws/:wsId/categories', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.wsId, 'MANAGER');
    const p = catCreate.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const max = (await prisma.category.aggregate({ where: { workspaceId: req.params.wsId }, _max: { ord: true } }))._max.ord ?? -1;
    const c = await prisma.category.create({ data: { label: p.data.label, color: p.data.color, workspaceId: req.params.wsId, ord: max + 1 } });
    res.json(catDTO(c));
  }));

  const catPatch = z.object({ label: z.string().min(1).max(60).optional(), color: z.string().max(20).nullish(), ord: z.number().int().optional() });
  app.patch('/api/categories/:id', requireAuth, h(async (req: any, res) => {
    const cur = await prisma.category.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!cur) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, cur.workspaceId, 'MANAGER');
    const p = catPatch.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const c = await prisma.category.update({ where: { id: req.params.id }, data: p.data });
    res.json(catDTO(c));
  }));

  app.delete('/api/categories/:id', requireAuth, h(async (req: any, res) => {
    const cur = await prisma.category.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!cur) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, cur.workspaceId, 'MANAGER');
    // Projects in this category are NOT deleted — they just fall back to
    // "uncategorized" (Project.categoryId -> NULL via onDelete: SetNull).
    await prisma.category.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  app.get('/api/ws/:wsId/categories', requireAuth, h(async (req: any, res) => {
    await assertMember(req.user.id, req.params.wsId);
    const rows = await prisma.category.findMany({ where: { workspaceId: req.params.wsId }, orderBy: { ord: 'asc' } });
    res.json(rows.map(catDTO));
  }));
}
