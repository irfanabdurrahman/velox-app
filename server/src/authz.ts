import type { Role } from '@prisma/client';
import { prisma } from './prisma.ts';

// Write capability rank. GUEST and EXEC_VIEWER are read-only (rank 0 for writes).
const WRITE_RANK: Record<Role, number> = {
  OWNER: 5, ADMIN: 4, MANAGER: 3, MEMBER: 2, GUEST: 0, EXEC_VIEWER: 0,
};
export const RANK: Record<string, number> = { MEMBER: 2, MANAGER: 3, ADMIN: 4, OWNER: 5 };

export class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function roleIn(userId: string, workspaceId: string): Promise<Role | null> {
  const m = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId, workspaceId } } });
  return m?.role ?? null;
}

export async function accessibleWorkspaceIds(userId: string): Promise<string[]> {
  const ms = await prisma.membership.findMany({ where: { userId }, select: { workspaceId: true } });
  return ms.map((m) => m.workspaceId);
}

export async function assertMember(userId: string, workspaceId: string): Promise<Role> {
  const role = await roleIn(userId, workspaceId);
  if (!role) throw new HttpError(403, 'not a member of this workspace');
  return role;
}

// Require at least `min` write capability (e.g. 'MEMBER' to edit, 'MANAGER' to delete).
export async function assertCan(userId: string, workspaceId: string, min: keyof typeof RANK) {
  const role = await assertMember(userId, workspaceId);
  if (WRITE_RANK[role] < RANK[min]) throw new HttpError(403, `requires ${min} role or higher`);
  return role;
}

export async function workspaceOfProject(projectId: string): Promise<string> {
  const p = await prisma.project.findUnique({ where: { id: projectId }, select: { workspaceId: true } });
  if (!p) throw new HttpError(404, 'project not found');
  return p.workspaceId;
}

export async function workspaceOfTask(taskId: string): Promise<string> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { project: { select: { workspaceId: true } } } });
  if (!t) throw new HttpError(404, 'task not found');
  return t.project.workspaceId;
}
