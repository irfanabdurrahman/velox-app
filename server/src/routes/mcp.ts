// B6 MCP-style tool server — lets external agents (Claude, OpenClaw, Hermes) drive
// Velox over plain JSON-over-HTTP. This is intentionally NOT the MCP SDK transport;
// it is a documented, curl-testable HTTP surface authenticated by a Velox API key.
//
// Endpoints (auth: `Authorization: Bearer vlx_live_...`):
//   GET  /api/mcp                 → manifest: server info + tool list with JSON-schemas.
//   POST /api/mcp/tools/:tool     → execute a tool. Body: { "arguments": { ... } }.
//                                    Returns { content: [{ type: 'text', text: <result JSON> }] }.
//
// Scopes: read tools require reports:read / tasks:read; write tools require tasks:write.
import express from 'express';
import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { prisma, todayIdx, HttpError } from '../ctx.ts';
import { apiKeyAuth, hasScope } from '../apikey.ts';
import { taskDTO } from '../index.ts';
import { emit } from '../events.ts';

type Tool = {
  name: string;
  description: string;
  scope: string;
  inputSchema: Record<string, any>;
  zod: z.ZodTypeAny;
  run: (args: any, req: any) => Promise<any>;
};

const obj = (properties: Record<string, any>, required: string[] = []) => ({ type: 'object', properties, required, additionalProperties: false });
const str = (description: string) => ({ type: 'string', description });
const int = (description: string) => ({ type: 'integer', description });

// Workspace-membership guards shared by the tools below.
async function taskInWs(taskId: string, ws: string) {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, projectId: true, parentId: true, deletedAt: true, s: true, e: true, deps: true, cf: true, project: { select: { workspaceId: true } } } });
  if (!t || t.deletedAt || t.project.workspaceId !== ws) throw new HttpError(404, 'task not found in this workspace');
  return t;
}
async function projInWs(pid: string, ws: string) {
  const p = await prisma.project.findUnique({ where: { id: pid }, select: { id: true, workspaceId: true, deletedAt: true } });
  if (!p || p.deletedAt || p.workspaceId !== ws) throw new HttpError(404, 'project not found in this workspace');
  return p;
}
async function goalInWs(goalId: string, ws: string) {
  const g = await prisma.goal.findUnique({ where: { id: goalId } });
  if (!g || g.workspaceId !== ws) throw new HttpError(404, 'goal not found in this workspace');
  return g;
}

const TOOLS: Tool[] = [
  {
    name: 'list_projects',
    description: 'List all projects in the workspace with status and progress.',
    scope: 'projects:read',
    inputSchema: obj({}),
    zod: z.object({}).passthrough(),
    run: async (_args, req) => {
      const rows = await prisma.project.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { createdAt: 'desc' } });
      return rows.map((p) => ({ id: p.id, name: p.name, code: p.code, status: p.st, progress: p.prog, due: p.due }));
    },
  },
  {
    name: 'query_tasks',
    description: 'Query tasks in the workspace, optionally filtered by project and/or status.',
    scope: 'tasks:read',
    inputSchema: obj({ projectId: str('Restrict to this project id'), status: str('Restrict to this task status, e.g. mut, prog, done') }),
    zod: z.object({ projectId: z.string().optional(), status: z.string().optional() }),
    run: async (args, req) => {
      const where: any = { project: { workspaceId: req.workspaceId }, deletedAt: null };
      if (args.projectId) where.projectId = args.projectId;
      if (args.status) where.st = args.status;
      const rows = await prisma.task.findMany({ where, orderBy: [{ ord: 'asc' }, { createdAt: 'asc' }], take: 200 });
      return rows.map((t) => ({ id: t.id, name: t.name, projectId: t.projectId, status: t.st, priority: t.pr, progress: t.pg, assigneeId: t.assigneeId, start: t.s, due: t.e }));
    },
  },
  {
    name: 'create_task',
    description: 'Create a task in a project owned by the workspace.',
    scope: 'tasks:write',
    inputSchema: obj({ projectId: str('Target project id'), name: str('Task name'), assigneeId: str('Optional assignee user id'), start: int('Optional start date as a day index'), due: int('Optional due date as a day index'), parentId: str('Optional parent task id — creates a subtask'), priority: str('Optional priority: low, med, high, urgent'), milestone: { type: 'boolean', description: 'Create as a milestone' }, description: str('Optional description (plain text)'), sectionId: str('Optional section id within the project') }, ['projectId', 'name']),
    zod: z.object({ projectId: z.string(), name: z.string().min(1).max(300), assigneeId: z.string().nullish(), start: z.number().int().nullish(), due: z.number().int().nullish(), parentId: z.string().nullish(), priority: z.string().max(20).nullish(), milestone: z.boolean().nullish(), description: z.string().max(8000).nullish(), sectionId: z.string().nullish() }),
    run: async (args, req) => {
      const proj = await prisma.project.findUnique({ where: { id: args.projectId }, select: { workspaceId: true } });
      if (!proj || proj.workspaceId !== req.workspaceId) throw new HttpError(404, 'project not found in this workspace');
      let s = args.start ?? null;
      let e = args.due ?? null;
      if (s != null && e != null && s > e) { [s, e] = [Math.min(s, e), Math.max(s, e)]; } // start must never exceed due, same rule as the web app
      if (args.parentId) {
        const parent = await prisma.task.findUnique({ where: { id: args.parentId }, select: { projectId: true } });
        if (!parent || parent.projectId !== args.projectId) throw new HttpError(400, 'parent task must be in the same project');
      }
      if (args.sectionId) {
        const sec = await prisma.section.findUnique({ where: { id: args.sectionId }, select: { projectId: true } });
        if (!sec || sec.projectId !== args.projectId) throw new HttpError(400, 'section must belong to the target project');
      }
      const task = await prisma.task.create({ data: { id: nanoid(10), projectId: args.projectId, parentId: args.parentId ?? null, name: args.name, assigneeId: args.assigneeId ?? null, s, e, st: 'mut', pr: args.priority || 'med', ms: !!args.milestone, descr: args.description ?? '', sectionId: args.sectionId ?? null } });
      emit(req.workspaceId, 'task.created', { task: taskDTO(task), taskId: task.id });
      return { id: task.id, name: task.name, projectId: task.projectId, status: task.st, start: task.s, due: task.e };
    },
  },
  {
    name: 'update_task_status',
    description: 'Set the status of a task in the workspace.',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Task id'), status: str('New status, e.g. mut, prog, done') }, ['taskId', 'status']),
    zod: z.object({ taskId: z.string(), status: z.string().min(1).max(40) }),
    run: async (args, req) => {
      const cur = await prisma.task.findUnique({ where: { id: args.taskId }, select: { st: true, project: { select: { workspaceId: true } } } });
      if (!cur || cur.project.workspaceId !== req.workspaceId) throw new HttpError(404, 'task not found in this workspace');
      const updated = await prisma.task.update({ where: { id: args.taskId }, data: { st: args.status } });
      emit(req.workspaceId, args.status !== cur.st ? 'status.changed' : 'task.updated', { task: taskDTO(updated), taskId: updated.id, st: updated.st });
      return { id: updated.id, status: updated.st };
    },
  },
  {
    name: 'update_task',
    description: 'Update fields on an existing task: name, start/due dates, priority, progress, or assignee. Omitted fields are left unchanged.',
    scope: 'tasks:write',
    inputSchema: obj({
      taskId: str('Task id'),
      name: str('New task name'),
      start: int('New start date as a day index'),
      due: int('New due date as a day index'),
      priority: str('New priority, e.g. low, med, high, urgent'),
      progress: int('New progress percentage, 0-100'),
      assigneeId: str('New assignee user id (pass an empty string to unassign)'),
    }, ['taskId']),
    zod: z.object({
      taskId: z.string(),
      name: z.string().min(1).max(300).optional(),
      start: z.number().int().nullish(),
      due: z.number().int().nullish(),
      priority: z.string().min(1).max(20).optional(),
      progress: z.number().int().min(0).max(100).optional(),
      assigneeId: z.string().nullish(),
    }),
    run: async (args, req) => {
      const cur = await prisma.task.findUnique({ where: { id: args.taskId }, select: { s: true, e: true, project: { select: { workspaceId: true } } } });
      if (!cur || cur.project.workspaceId !== req.workspaceId) throw new HttpError(404, 'task not found in this workspace');
      const data: any = {};
      if (args.name !== undefined) data.name = args.name;
      if (args.priority !== undefined) data.pr = args.priority;
      if (args.progress !== undefined) data.pg = args.progress;
      if (args.assigneeId !== undefined) data.assigneeId = args.assigneeId || null;
      // normalize start/due so start never exceeds due, same rule as the web app
      let s = 'start' in args ? args.start : cur.s;
      let e = 'due' in args ? args.due : cur.e;
      if (s != null && e != null && s > e) { [s, e] = [Math.min(s, e), Math.max(s, e)]; }
      if ('start' in args) data.s = s;
      if ('due' in args) data.e = e;
      const updated = await prisma.task.update({ where: { id: args.taskId }, data });
      emit(req.workspaceId, 'task.updated', { task: taskDTO(updated), taskId: updated.id, st: updated.st });
      return { id: updated.id, name: updated.name, priority: updated.pr, progress: updated.pg, assigneeId: updated.assigneeId, start: updated.s, due: updated.e };
    },
  },
  {
    name: 'get_risk_report',
    description: 'List projects currently flagged at risk or off track.',
    scope: 'reports:read',
    inputSchema: obj({}),
    zod: z.object({}).passthrough(),
    run: async (_args, req) => {
      const rows = await prisma.project.findMany({ where: { workspaceId: req.workspaceId, archived: false, st: { in: ['risk', 'bad'] } }, orderBy: { prog: 'asc' } });
      return { count: rows.length, projects: rows.map((p) => ({ id: p.id, name: p.name, status: p.st, progress: p.prog, due: p.due, ownerId: p.ownerId })) };
    },
  },
  {
    name: 'get_overdue_summary',
    description: 'Summarize incomplete tasks whose due date has passed.',
    scope: 'reports:read',
    inputSchema: obj({}),
    zod: z.object({}).passthrough(),
    run: async (_args, req) => {
      const today = todayIdx();
      const rows = await prisma.task.findMany({ where: { project: { workspaceId: req.workspaceId }, deletedAt: null, st: { not: 'done' }, e: { lt: today } }, include: { project: { select: { name: true } } }, orderBy: { e: 'asc' }, take: 200 });
      return { asOf: today, count: rows.length, tasks: rows.map((t) => ({ id: t.id, name: t.name, projectName: t.project.name, due: t.e, daysOverdue: today - (t.e as number) })) };
    },
  },
  {
    name: 'post_comment',
    description: 'Post a comment on a task in the workspace.',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Task id'), text: str('Comment text') }, ['taskId', 'text']),
    zod: z.object({ taskId: z.string(), text: z.string().min(1).max(4000) }),
    run: async (args, req) => {
      const t = await prisma.task.findUnique({ where: { id: args.taskId }, select: { project: { select: { workspaceId: true } } } });
      if (!t || t.project.workspaceId !== req.workspaceId) throw new HttpError(404, 'task not found in this workspace');
      const c = await prisma.comment.create({ data: { taskId: args.taskId, authorId: null, whenTxt: 'via MCP', txt: args.text, rx: [] } });
      emit(req.workspaceId, 'comment.added', { taskId: args.taskId, comment: { id: c.id, who: null, txt: c.txt } });
      return { id: c.id, taskId: args.taskId };
    },
  },
  // ---- workspace metadata ---------------------------------------------------
  {
    name: 'list_members',
    description: 'List workspace members with user ids and roles — use these ids for assigneeId fields.',
    scope: 'projects:read',
    inputSchema: obj({}),
    zod: z.object({}).passthrough(),
    run: async (_args, req) => {
      const rows = await prisma.membership.findMany({ where: { workspaceId: req.workspaceId }, include: { user: { select: { id: true, name: true, email: true } } } });
      return rows.map((m) => ({ userId: m.userId, name: m.user.name, email: m.user.email, role: m.role }));
    },
  },
  {
    name: 'list_sections',
    description: 'List the sections of a project.',
    scope: 'tasks:read',
    inputSchema: obj({ projectId: str('Project id') }, ['projectId']),
    zod: z.object({ projectId: z.string() }),
    run: async (args, req) => {
      await projInWs(args.projectId, req.workspaceId);
      const rows = await prisma.section.findMany({ where: { projectId: args.projectId }, orderBy: { ord: 'asc' } });
      return rows.map((x) => ({ id: x.id, name: x.name, ord: x.ord }));
    },
  },
  {
    name: 'list_custom_fields',
    description: 'List the custom fields defined on a project (use the field ids with set_custom_field).',
    scope: 'tasks:read',
    inputSchema: obj({ projectId: str('Project id') }, ['projectId']),
    zod: z.object({ projectId: z.string() }),
    run: async (args, req) => {
      await projInWs(args.projectId, req.workspaceId);
      const rows = await prisma.customField.findMany({ where: { projectId: args.projectId }, orderBy: { ord: 'asc' } });
      return rows.map((f) => ({ id: f.id, name: f.name, kind: f.kind, config: f.config }));
    },
  },
  {
    name: 'get_task_detail',
    description: 'Full detail of one task: all fields, description, checklist, dependencies, subtasks, latest comments and recent activity.',
    scope: 'tasks:read',
    inputSchema: obj({ taskId: str('Task id') }, ['taskId']),
    zod: z.object({ taskId: z.string() }),
    run: async (args, req) => {
      await taskInWs(args.taskId, req.workspaceId);
      const t = await prisma.task.findUnique({ where: { id: args.taskId }, include: { assignees: true, watchers: true } });
      const [subs, comments, activity] = await Promise.all([
        prisma.task.findMany({ where: { parentId: args.taskId, deletedAt: null }, select: { id: true, name: true, st: true, pg: true, assigneeId: true, s: true, e: true } }),
        prisma.comment.findMany({ where: { taskId: args.taskId }, orderBy: { createdAt: 'desc' }, take: 20, include: { author: { select: { name: true } } } }),
        prisma.auditLog.findMany({ where: { workspaceId: req.workspaceId, target: args.taskId }, orderBy: { createdAt: 'desc' }, take: 10, include: { actor: { select: { name: true } } } }),
      ]);
      return {
        ...taskDTO(t),
        subtasks: subs,
        comments: comments.map((c) => ({ id: c.id, author: c.author?.name ?? 'via MCP', text: c.txt, at: c.createdAt })),
        activity: activity.map((a) => ({ action: a.action, actor: a.actor?.name ?? null, at: a.createdAt })),
      };
    },
  },
  // ---- projects ---------------------------------------------------------------
  {
    name: 'create_project',
    description: 'Create a new project in the workspace.',
    scope: 'projects:write',
    inputSchema: obj({ name: str('Project name'), code: str('Optional short code (max 6 chars)'), color: str('Optional hex color like #6366F1') }, ['name']),
    zod: z.object({ name: z.string().min(1).max(200), code: z.string().max(6).optional(), color: z.string().max(9).optional() }),
    run: async (args, req) => {
      const p = await prisma.project.create({ data: { id: nanoid(10), name: args.name, code: args.code || 'NP', workspaceId: req.workspaceId, ownerId: null, st: 'mut', prog: 0, color: args.color || '#6366F1' } });
      return { id: p.id, name: p.name, code: p.code, status: p.st };
    },
  },
  {
    name: 'archive_project',
    description: 'Archive (or unarchive) a project. Archiving hides it from active views; nothing is deleted.',
    scope: 'projects:write',
    inputSchema: obj({ projectId: str('Project id'), archived: { type: 'boolean', description: 'true to archive (default), false to restore' } }, ['projectId']),
    zod: z.object({ projectId: z.string(), archived: z.boolean().optional() }),
    run: async (args, req) => {
      await projInWs(args.projectId, req.workspaceId);
      const p = await prisma.project.update({ where: { id: args.projectId }, data: { archived: args.archived ?? true } });
      return { id: p.id, archived: p.archived };
    },
  },
  // ---- task structure -----------------------------------------------------------
  {
    name: 'delete_task',
    description: 'Move a task and its whole subtree to the trash (restorable in-app for 30 days).',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Task id') }, ['taskId']),
    zod: z.object({ taskId: z.string() }),
    run: async (args, req) => {
      await taskInWs(args.taskId, req.workspaceId);
      const ids = new Set<string>([args.taskId]);
      let frontier = [args.taskId];
      while (frontier.length) {
        const kids = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
        frontier = kids.map((k) => k.id).filter((x) => !ids.has(x));
        frontier.forEach((x) => ids.add(x));
      }
      const idArr = [...ids];
      await prisma.task.updateMany({ where: { id: { in: idArr } }, data: { deletedAt: new Date() } });
      emit(req.workspaceId, 'task.deleted', { taskId: args.taskId, ids: idArr });
      return { ok: true, trashed: idArr.length };
    },
  },
  {
    name: 'move_task',
    description: 'Move a task (and its subtree) to another project in the workspace — e.g. to triage items out of the "Belum diatur" inbox. Sections and cross-project dependencies are detached.',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Task id'), projectId: str('Destination project id') }, ['taskId', 'projectId']),
    zod: z.object({ taskId: z.string(), projectId: z.string() }),
    run: async (args, req) => {
      const task = await taskInWs(args.taskId, req.workspaceId);
      await projInWs(args.projectId, req.workspaceId);
      if (task.projectId === args.projectId) return { ok: true, moved: 0 };
      const ids = new Set<string>([task.id]);
      let frontier = [task.id];
      while (frontier.length) {
        const kids = await prisma.task.findMany({ where: { parentId: { in: frontier } }, select: { id: true } });
        frontier = kids.map((k) => k.id).filter((x) => !ids.has(x));
        frontier.forEach((x) => ids.add(x));
      }
      const idArr = [...ids];
      await prisma.task.updateMany({ where: { id: { in: idArr } }, data: { projectId: args.projectId, sectionId: null } });
      if (task.parentId) await prisma.task.update({ where: { id: task.id }, data: { parentId: null } });
      const moved = await prisma.task.findMany({ where: { id: { in: idArr } }, select: { id: true, deps: true } });
      for (const m of moved) {
        const deps = Array.isArray(m.deps) ? (m.deps as any[]) : [];
        const kept = deps.filter((d) => d && ids.has(d.t));
        if (kept.length !== deps.length) await prisma.task.update({ where: { id: m.id }, data: { deps: kept } });
      }
      const stay = await prisma.task.findMany({ where: { projectId: task.projectId, deletedAt: null }, select: { id: true, deps: true } });
      for (const st of stay) {
        const deps = Array.isArray(st.deps) ? (st.deps as any[]) : [];
        const kept = deps.filter((d) => d && !ids.has(d.t));
        if (kept.length !== deps.length) await prisma.task.update({ where: { id: st.id }, data: { deps: kept } });
      }
      const fresh = await prisma.task.findMany({ where: { id: { in: idArr } }, include: { assignees: true, watchers: true, homes: true } });
      for (const t of fresh) emit(req.workspaceId, 'task.updated', { task: taskDTO(t), taskId: t.id });
      return { ok: true, moved: idArr.length, projectId: args.projectId };
    },
  },
  {
    name: 'set_dependency',
    description: 'Add or replace a dependency: the task will depend on another task in the same project. Types: FS (finish-to-start, default), SS, FF, SF; optional lag in days.',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Dependent task id'), dependsOnId: str('Task it depends on'), type: str('FS | SS | FF | SF (default FS)'), lag: int('Lag in days (default 0)') }, ['taskId', 'dependsOnId']),
    zod: z.object({ taskId: z.string(), dependsOnId: z.string(), type: z.enum(['FS', 'SS', 'FF', 'SF']).optional(), lag: z.number().int().min(-365).max(365).optional() }),
    run: async (args, req) => {
      if (args.taskId === args.dependsOnId) throw new HttpError(400, 'a task cannot depend on itself');
      const t = await taskInWs(args.taskId, req.workspaceId);
      const on = await taskInWs(args.dependsOnId, req.workspaceId);
      if (t.projectId !== on.projectId) throw new HttpError(400, 'dependencies must stay within one project');
      const deps = (Array.isArray(t.deps) ? (t.deps as any[]) : []).filter((d) => d && d.t !== args.dependsOnId);
      deps.push({ t: args.dependsOnId, type: args.type || 'FS', lag: args.lag ?? 0 });
      const updated = await prisma.task.update({ where: { id: args.taskId }, data: { deps } });
      emit(req.workspaceId, 'task.updated', { task: taskDTO(updated), taskId: updated.id });
      return { id: updated.id, deps };
    },
  },
  {
    name: 'remove_dependency',
    description: 'Remove a dependency from a task.',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Dependent task id'), dependsOnId: str('Dependency to remove') }, ['taskId', 'dependsOnId']),
    zod: z.object({ taskId: z.string(), dependsOnId: z.string() }),
    run: async (args, req) => {
      const t = await taskInWs(args.taskId, req.workspaceId);
      const deps = (Array.isArray(t.deps) ? (t.deps as any[]) : []).filter((d) => d && d.t !== args.dependsOnId);
      const updated = await prisma.task.update({ where: { id: args.taskId }, data: { deps } });
      emit(req.workspaceId, 'task.updated', { task: taskDTO(updated), taskId: updated.id });
      return { id: updated.id, deps };
    },
  },
  {
    name: 'set_task_section',
    description: 'Place a task in a section of its project (or pass no sectionId to clear it).',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Task id'), sectionId: str('Section id — omit to clear') }, ['taskId']),
    zod: z.object({ taskId: z.string(), sectionId: z.string().nullish() }),
    run: async (args, req) => {
      const t = await taskInWs(args.taskId, req.workspaceId);
      if (args.sectionId) {
        const sec = await prisma.section.findUnique({ where: { id: args.sectionId }, select: { projectId: true } });
        if (!sec || sec.projectId !== t.projectId) throw new HttpError(400, 'section must belong to the task\'s project');
      }
      const updated = await prisma.task.update({ where: { id: args.taskId }, data: { sectionId: args.sectionId ?? null } });
      emit(req.workspaceId, 'task.updated', { task: taskDTO(updated), taskId: updated.id });
      return { id: updated.id, sectionId: updated.sectionId };
    },
  },
  {
    name: 'set_custom_field',
    description: 'Set a custom-field value on a task (find field ids via list_custom_fields). Pass null to clear.',
    scope: 'tasks:write',
    inputSchema: obj({ taskId: str('Task id'), fieldId: str('Custom field id'), value: { description: 'New value (string or number, null clears)' } }, ['taskId', 'fieldId']),
    zod: z.object({ taskId: z.string(), fieldId: z.string(), value: z.union([z.string(), z.number(), z.null()]) }),
    run: async (args, req) => {
      const t = await taskInWs(args.taskId, req.workspaceId);
      const field = await prisma.customField.findUnique({ where: { id: args.fieldId }, select: { projectId: true } });
      if (!field || field.projectId !== t.projectId) throw new HttpError(400, 'field must belong to the task\'s project');
      const cf: any = { ...((t.cf as any) || {}) };
      if (args.value === null) delete cf[args.fieldId]; else cf[args.fieldId] = args.value;
      const updated = await prisma.task.update({ where: { id: args.taskId }, data: { cf } });
      emit(req.workspaceId, 'task.updated', { task: taskDTO(updated), taskId: updated.id });
      return { id: updated.id, customFields: updated.cf };
    },
  },
  // ---- goals / OKR ---------------------------------------------------------------
  {
    name: 'list_goals',
    description: 'List OKR goals and their key results (current/target, optional linked project).',
    scope: 'goals:read',
    inputSchema: obj({}),
    zod: z.object({}).passthrough(),
    run: async (_args, req) => {
      const rows = await prisma.goal.findMany({ where: { workspaceId: req.workspaceId }, orderBy: { ord: 'asc' }, include: { keyResults: true } });
      return rows.map((g) => ({ id: g.id, name: g.name, keyResults: g.keyResults.map((k) => ({ id: k.id, name: k.name, current: k.current, target: k.target, projectId: k.projectId })) }));
    },
  },
  {
    name: 'create_goal',
    description: 'Create an OKR goal, optionally with initial key results.',
    scope: 'goals:write',
    inputSchema: obj({ name: str('Goal name'), keyResults: { type: 'array', description: 'Optional key results: [{ name, target }]', items: { type: 'object' } } }, ['name']),
    zod: z.object({ name: z.string().min(1).max(300), keyResults: z.array(z.object({ name: z.string().min(1).max(300), target: z.number().int().min(1).max(1000000).optional() })).max(20).optional() }),
    run: async (args, req) => {
      const g = await prisma.goal.create({ data: { workspaceId: req.workspaceId, name: args.name } });
      const krs = [];
      for (const kr of args.keyResults || []) krs.push(await prisma.keyResult.create({ data: { goalId: g.id, name: kr.name, target: kr.target ?? 100 } }));
      return { id: g.id, name: g.name, keyResults: krs.map((k) => ({ id: k.id, name: k.name, current: k.current, target: k.target })) };
    },
  },
  {
    name: 'add_key_result',
    description: 'Add a key result to an existing goal.',
    scope: 'goals:write',
    inputSchema: obj({ goalId: str('Goal id'), name: str('Key result name'), target: int('Target value (default 100)') }, ['goalId', 'name']),
    zod: z.object({ goalId: z.string(), name: z.string().min(1).max(300), target: z.number().int().min(1).max(1000000).optional() }),
    run: async (args, req) => {
      await goalInWs(args.goalId, req.workspaceId);
      const k = await prisma.keyResult.create({ data: { goalId: args.goalId, name: args.name, target: args.target ?? 100 } });
      return { id: k.id, name: k.name, current: k.current, target: k.target };
    },
  },
  {
    name: 'update_key_result',
    description: 'Update a key result: its current value, name or target.',
    scope: 'goals:write',
    inputSchema: obj({ keyResultId: str('Key result id'), current: int('New current value'), name: str('New name'), target: int('New target') }, ['keyResultId']),
    zod: z.object({ keyResultId: z.string(), current: z.number().int().min(0).max(1000000).optional(), name: z.string().min(1).max(300).optional(), target: z.number().int().min(1).max(1000000).optional() }),
    run: async (args, req) => {
      const kr = await prisma.keyResult.findUnique({ where: { id: args.keyResultId }, include: { goal: true } });
      if (!kr || kr.goal.workspaceId !== req.workspaceId) throw new HttpError(404, 'key result not found in this workspace');
      const data: any = {};
      if (args.current !== undefined) data.current = args.current;
      if (args.name !== undefined) data.name = args.name;
      if (args.target !== undefined) data.target = args.target;
      const updated = await prisma.keyResult.update({ where: { id: args.keyResultId }, data });
      return { id: updated.id, name: updated.name, current: updated.current, target: updated.target };
    },
  },
];

export function registerMcp(app: Express) {
  const mcp = express.Router();
  mcp.use(apiKeyAuth); // every MCP call is authenticated + workspace-scoped by API key

  // Manifest — describes the server and every callable tool with its JSON-schema.
  mcp.get('/', (_req, res) => {
    res.json({
      name: 'velox-mcp',
      version: '1.0.0',
      description: 'Velox project-management tools for external agents, over JSON/HTTP.',
      protocol: 'http-json',
      auth: 'Authorization: Bearer <vlx_live_ API key, or a vlx_oat_ OAuth access token>',
      oauth: { authorizationServer: '/.well-known/oauth-authorization-server', protectedResource: '/.well-known/oauth-protected-resource' },
      endpoints: { manifest: 'GET /api/mcp', call: 'POST /api/mcp/tools/:tool  (body: { "arguments": {...} })' },
      tools: TOOLS.map((t) => ({ name: t.name, description: t.description, scope: t.scope, inputSchema: t.inputSchema })),
    });
  });

  // Execute a tool. Enforces the tool's scope; returns MCP-style text content.
  mcp.post('/tools/:tool', async (req: any, res) => {
    try {
      const tool = TOOLS.find((t) => t.name === req.params.tool);
      if (!tool) return res.status(404).json({ error: `unknown tool: ${req.params.tool}` });
      if (!hasScope(req, tool.scope)) return res.status(403).json({ error: `missing required scope: ${tool.scope}` });
      const parsed = tool.zod.safeParse(req.body?.arguments ?? {});
      if (!parsed.success) return res.status(400).json({ error: 'invalid arguments', details: parsed.error.issues });
      const result = await tool.run(parsed.data, req);
      res.json({ content: [{ type: 'text', text: JSON.stringify(result) }] });
    } catch (e: any) {
      if (e instanceof HttpError) return res.status(e.status).json({ error: e.message, isError: true });
      console.error(e);
      res.status(500).json({ error: 'internal error', isError: true });
    }
  });

  // ---- real MCP protocol (JSON-RPC 2.0 over "Streamable HTTP") -------------
  // The routes above are a custom, curl-friendly REST shape for direct callers
  // (Hermes, scripts). Claude.ai's Connectors feature instead speaks actual MCP:
  // it POSTs JSON-RPC requests to the base URL and expects `initialize` /
  // `tools/list` / `tools/call` methods. Without this, OAuth succeeds (that's a
  // generic auth layer) but the handshake right after it has nothing to reply to,
  // which is why Claude.ai reports "no MCP server was found at this URL".
  const runTool = async (name: string, args: any, req: any) => {
    const tool = TOOLS.find((t) => t.name === name);
    if (!tool) return { content: [{ type: 'text', text: `Unknown tool: ${name}` }], isError: true };
    if (!hasScope(req, tool.scope)) return { content: [{ type: 'text', text: `Missing required scope: ${tool.scope}` }], isError: true };
    const parsed = tool.zod.safeParse(args ?? {});
    if (!parsed.success) return { content: [{ type: 'text', text: `Invalid arguments: ${JSON.stringify(parsed.error.issues)}` }], isError: true };
    try {
      const result = await tool.run(parsed.data, req);
      return { content: [{ type: 'text', text: JSON.stringify(result) }] };
    } catch (e: any) {
      return { content: [{ type: 'text', text: e instanceof HttpError ? e.message : 'internal error' }], isError: true };
    }
  };

  mcp.post('/', async (req: any, res) => {
    const msg = req.body;
    if (!msg || typeof msg !== 'object' || msg.jsonrpc !== '2.0' || typeof msg.method !== 'string') {
      return res.status(400).json({ jsonrpc: '2.0', id: msg?.id ?? null, error: { code: -32600, message: 'Invalid Request' } });
    }
    const { id, method, params } = msg;
    const isNotification = id === undefined;
    const reply = (result: any) => res.json({ jsonrpc: '2.0', id, result });

    try {
      if (method === 'initialize') {
        return reply({
          protocolVersion: params?.protocolVersion || '2025-06-18',
          capabilities: { tools: {} },
          serverInfo: { name: 'velox-mcp', version: '1.0.0' },
        });
      }
      if (method === 'ping') return reply({});
      if (method === 'tools/list') {
        return reply({ tools: TOOLS.map((t) => ({ name: t.name, description: t.description, inputSchema: t.inputSchema })) });
      }
      if (method === 'tools/call') {
        return reply(await runTool(params?.name, params?.arguments, req));
      }
      if (isNotification) return res.status(202).end(); // e.g. notifications/initialized — no response expected
      return res.json({ jsonrpc: '2.0', id, error: { code: -32601, message: `Method not found: ${method}` } });
    } catch (e) {
      console.error(e);
      if (isNotification) return res.status(202).end();
      return res.json({ jsonrpc: '2.0', id, error: { code: -32603, message: 'Internal error' } });
    }
  });

  // Session termination / server-push stream — unsupported (we're stateless
  // and never push), so decline per spec rather than 404.
  mcp.delete('/', (_req, res) => res.status(405).end());

  app.use('/api/mcp', mcp);
}
