import type { Request, Response } from 'express';
import { z } from 'zod';
export { prisma } from './prisma.ts';
export { requireAuth, type AuthedRequest } from './auth.ts';
export { HttpError, assertCan, assertMember, roleIn, accessibleWorkspaceIds, workspaceOfProject, workspaceOfTask } from './authz.ts';
import { HttpError } from './authz.ts';

// async route wrapper that maps HttpError → status and everything else → 500
export const h = (fn: (req: any, res: Response) => Promise<any>) =>
  (req: Request, res: Response) => fn(req, res).catch((e: any) => {
    if (e instanceof HttpError) return res.status(e.status).json({ error: e.message });
    console.error(e);
    res.status(500).json({ error: 'internal error' });
  });

export const bad = (res: Response, e: z.ZodError) => res.status(400).json({ error: 'validation', details: e.issues });

export const EP = Date.UTC(2026, 5, 29);
export const todayIdx = () => Math.max(0, Math.floor((Date.now() - EP) / 864e5));
