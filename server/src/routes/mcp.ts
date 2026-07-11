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
      return rows.map((t) => ({ id: t.id, name: t.name, projectId: t.projectId, status: t.st, priority: t.pr, progress: t.pg, assigneeId: t.assigneeId, due: t.e }));
    },
  },
  {
    name: 'create_task',
    description: 'Create a task in a project owned by the workspace.',
    scope: 'tasks:write',
    inputSchema: obj({ projectId: str('Target project id'), name: str('Task name'), assigneeId: str('Optional assignee user id'), due: int('Optional due date as a day index') }, ['projectId', 'name']),
    zod: z.object({ projectId: z.string(), name: z.string().min(1).max(300), assigneeId: z.string().nullish(), due: z.number().int().nullish() }),
    run: async (args, req) => {
      const proj = await prisma.project.findUnique({ where: { id: args.projectId }, select: { workspaceId: true } });
      if (!proj || proj.workspaceId !== req.workspaceId) throw new HttpError(404, 'project not found in this workspace');
      const task = await prisma.task.create({ data: { id: nanoid(10), projectId: args.projectId, name: args.name, assigneeId: args.assigneeId ?? null, e: args.due ?? null, st: 'mut', pr: 'med' } });
      emit(req.workspaceId, 'task.created', { task: taskDTO(task), taskId: task.id });
      return { id: task.id, name: task.name, projectId: task.projectId, status: task.st };
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
      auth: 'Authorization: Bearer <vlx_live_ API key>',
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

  app.use('/api/mcp', mcp);
}
