// B6 integrations — management CRUD (JWT-authed) for API keys, webhooks, automation
// rules and intake forms, plus a PUBLIC form-submit endpoint that auto-creates a task.
// Create/delete of a resource requires MANAGER; other reads/updates require membership.
import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { randomBytes, createHmac } from 'node:crypto';
import rateLimit from 'express-rate-limit';
import { prisma, requireAuth, h, bad, HttpError, assertCan, assertMember } from '../ctx.ts';
import { hashApiKey } from '../apikey.ts';
import { taskDTO } from '../index.ts';
import { emit } from '../events.ts';

// ---- DTOs (never leak more than the client should see) ---------------------
const webhookDTO = (w: any) => ({ id: w.id, url: w.url, events: w.events ?? [], secret: w.secret, active: w.active, createdAt: w.createdAt });
const ruleDTO = (r: any) => ({ id: r.id, name: r.name, trigger: r.trigger, action: r.action, active: r.active, createdAt: r.createdAt });
const formDTO = (f: any) => ({ id: f.id, name: f.name, projectId: f.projectId, fields: f.fields ?? [], active: f.active, createdAt: f.createdAt });

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));
const firstStr = (v: any) => (typeof v === 'string' && v.trim() ? v : typeof v === 'number' ? String(v) : '');

// Webhook event types surfaced by the catalog + accepted in subscriptions.
const EVENT_CATALOG = [
  { event: 'task.created', description: 'A task was created.' },
  { event: 'task.updated', description: 'A task field changed (name, dates, assignee, progress…).' },
  { event: 'status.changed', description: 'A task moved to a new status.' },
  { event: 'task.deleted', description: 'A task was moved to the trash.' },
  { event: 'comment.added', description: 'A comment was posted on a task.' },
  { event: 'project.at_risk', description: 'A status update flagged a project at risk or off track.' },
  { event: 'milestone.completed', description: 'A milestone task was marked done.' },
  { event: 'status_update.posted', description: 'A weekly project status update was posted.' },
];

const triggerSchema = z.object({ type: z.enum(['status.changed', 'task.created', 'comment.added', 'due.soon']), to: z.string().optional() }).passthrough();
const actionSchema = z.object({ type: z.enum(['set_status', 'assign', 'add_comment', 'notify', 'call_webhook']) }).passthrough();

export function registerIntegrationRoutes(app: Express) {
  // ======================= API KEYS =======================================
  const apikeyCreate = z.object({ name: z.string().min(1).max(120), scopes: z.array(z.string()).default([]) });
  app.post('/api/ws/:wsId/apikeys', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.wsId, 'MANAGER');
    const p = apikeyCreate.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const raw = 'vlx_live_' + randomBytes(18).toString('base64url'); // 24-char secret
    const prefix = raw.slice(0, 12);
    const key = await prisma.apiKey.create({ data: { workspaceId: req.params.wsId, createdById: req.user.id, name: p.data.name, prefix, keyHash: hashApiKey(raw), scopes: p.data.scopes } });
    // The raw key is returned exactly once here and is never retrievable again.
    res.json({ id: key.id, name: key.name, prefix, scopes: p.data.scopes, key: raw });
  }));

  app.get('/api/ws/:wsId/apikeys', requireAuth, h(async (req: any, res) => {
    await assertMember(req.user.id, req.params.wsId);
    const rows = await prisma.apiKey.findMany({ where: { workspaceId: req.params.wsId }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map((k) => ({ id: k.id, name: k.name, prefix: k.prefix, scopes: k.scopes ?? [], lastUsedAt: k.lastUsedAt, revoked: k.revoked })));
  }));

  app.delete('/api/apikeys/:id', requireAuth, h(async (req: any, res) => {
    const k = await prisma.apiKey.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!k) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, k.workspaceId, 'MANAGER');
    await prisma.apiKey.update({ where: { id: req.params.id }, data: { revoked: true } });
    res.json({ ok: true });
  }));

  // ======================= WEBHOOKS =======================================
  const whCreate = z.object({ url: z.string().url(), events: z.array(z.string()).default([]) });
  app.post('/api/ws/:wsId/webhooks', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.wsId, 'MANAGER');
    const p = whCreate.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const secret = 'whsec_' + randomBytes(24).toString('hex');
    const wh = await prisma.webhook.create({ data: { workspaceId: req.params.wsId, url: p.data.url, events: p.data.events, secret } });
    res.json(webhookDTO(wh));
  }));

  app.get('/api/ws/:wsId/webhooks', requireAuth, h(async (req: any, res) => {
    // signing secrets are sensitive → MANAGER+ only
    await assertCan(req.user.id, req.params.wsId, 'MANAGER');
    const rows = await prisma.webhook.findMany({ where: { workspaceId: req.params.wsId }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(webhookDTO));
  }));

  const whPatch = z.object({ active: z.boolean().optional(), events: z.array(z.string()).optional(), url: z.string().url().optional() });
  app.patch('/api/webhooks/:id', requireAuth, h(async (req: any, res) => {
    const wh = await prisma.webhook.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!wh) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, wh.workspaceId, 'MEMBER');
    const p = whPatch.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const updated = await prisma.webhook.update({ where: { id: req.params.id }, data: p.data });
    res.json(webhookDTO(updated));
  }));

  app.delete('/api/webhooks/:id', requireAuth, h(async (req: any, res) => {
    const wh = await prisma.webhook.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!wh) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, wh.workspaceId, 'MANAGER');
    await prisma.webhook.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  // Send a signed `ping` to the target and record the delivery result.
  app.post('/api/webhooks/:id/test', requireAuth, h(async (req: any, res) => {
    const wh = await prisma.webhook.findUnique({ where: { id: req.params.id } });
    if (!wh) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, wh.workspaceId, 'MEMBER');
    const body = JSON.stringify({ event: 'ping', ts: Date.now(), data: { hello: 'velox', webhookId: wh.id } });
    const sig = createHmac('sha256', wh.secret).update(body).digest('hex');
    let status: number | null = null, ok = false;
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const r = await fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Velox-Event': 'ping', 'X-Velox-Signature': `sha256=${sig}` }, body, signal: controller.signal }).finally(() => clearTimeout(t));
      status = r.status; ok = r.ok;
    } catch { /* connection failure recorded below */ }
    const d = await prisma.webhookDelivery.create({ data: { webhookId: wh.id, event: 'ping', status, ok } });
    res.json({ ok, status, deliveryId: d.id });
  }));

  app.get('/api/webhooks/:id/deliveries', requireAuth, h(async (req: any, res) => {
    const wh = await prisma.webhook.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!wh) throw new HttpError(404, 'not found');
    await assertMember(req.user.id, wh.workspaceId);
    const rows = await prisma.webhookDelivery.findMany({ where: { webhookId: req.params.id }, orderBy: { createdAt: 'desc' }, take: 20 });
    res.json(rows.map((d) => ({ id: d.id, event: d.event, status: d.status, ok: d.ok, createdAt: d.createdAt })));
  }));

  // ======================= RULES ==========================================
  const ruleCreate = z.object({ name: z.string().min(1).max(120), trigger: triggerSchema, action: actionSchema, active: z.boolean().optional() });
  app.post('/api/ws/:wsId/rules', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.wsId, 'MANAGER');
    const p = ruleCreate.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const r = await prisma.rule.create({ data: { workspaceId: req.params.wsId, name: p.data.name, trigger: p.data.trigger as any, action: p.data.action as any, active: p.data.active ?? true } });
    res.json(ruleDTO(r));
  }));

  app.get('/api/ws/:wsId/rules', requireAuth, h(async (req: any, res) => {
    await assertMember(req.user.id, req.params.wsId);
    const rows = await prisma.rule.findMany({ where: { workspaceId: req.params.wsId }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(ruleDTO));
  }));

  const rulePatch = z.object({ name: z.string().min(1).max(120).optional(), trigger: triggerSchema.optional(), action: actionSchema.optional(), active: z.boolean().optional() });
  app.patch('/api/rules/:id', requireAuth, h(async (req: any, res) => {
    const r = await prisma.rule.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!r) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, r.workspaceId, 'MEMBER');
    const p = rulePatch.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const data: any = {};
    if (p.data.name !== undefined) data.name = p.data.name;
    if (p.data.trigger !== undefined) data.trigger = p.data.trigger;
    if (p.data.action !== undefined) data.action = p.data.action;
    if (p.data.active !== undefined) data.active = p.data.active;
    const updated = await prisma.rule.update({ where: { id: req.params.id }, data });
    res.json(ruleDTO(updated));
  }));

  app.delete('/api/rules/:id', requireAuth, h(async (req: any, res) => {
    const r = await prisma.rule.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!r) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, r.workspaceId, 'MANAGER');
    await prisma.rule.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  // ======================= FORMS ==========================================
  const formField = z.object({ key: z.string().min(1), label: z.string().optional(), type: z.string().optional(), required: z.boolean().optional() });
  const formCreate = z.object({ name: z.string().min(1).max(120), projectId: z.string(), fields: z.array(formField).default([]) });
  app.post('/api/ws/:wsId/forms', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, req.params.wsId, 'MANAGER');
    const p = formCreate.safeParse(req.body); if (!p.success) return bad(res, p.error);
    const proj = await prisma.project.findUnique({ where: { id: p.data.projectId }, select: { workspaceId: true } });
    if (!proj || proj.workspaceId !== req.params.wsId) throw new HttpError(400, 'project not in this workspace');
    const f = await prisma.form.create({ data: { workspaceId: req.params.wsId, projectId: p.data.projectId, name: p.data.name, fields: p.data.fields as any } });
    res.json(formDTO(f));
  }));

  app.get('/api/ws/:wsId/forms', requireAuth, h(async (req: any, res) => {
    await assertMember(req.user.id, req.params.wsId);
    const rows = await prisma.form.findMany({ where: { workspaceId: req.params.wsId }, orderBy: { createdAt: 'desc' } });
    res.json(rows.map(formDTO));
  }));

  app.delete('/api/forms/:id', requireAuth, h(async (req: any, res) => {
    const f = await prisma.form.findUnique({ where: { id: req.params.id }, select: { workspaceId: true } });
    if (!f) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, f.workspaceId, 'MANAGER');
    await prisma.form.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  // PUBLIC intake: no auth. Records the submission and auto-creates a task in the
  // form's project. Lightly rate-limited per IP to blunt spam.
  const submitLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });
  app.post('/api/forms/:id/submit', submitLimiter, h(async (req: any, res) => {
    const form = await prisma.form.findUnique({ where: { id: req.params.id } });
    if (!form || !form.active) throw new HttpError(404, 'form not found');
    if (!form.projectId) throw new HttpError(400, 'form has no target project');
    const data: Record<string, any> = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
    const fields = (form.fields as any[]) || [];
    // Title precedence: title/name field → first non-empty text field → first value.
    let title = firstStr(data.title) || firstStr(data.name);
    if (!title) {
      const tf = fields.find((f) => (f.type ?? 'text') === 'text' && String(data[f.key] ?? '').trim());
      if (tf) title = String(data[tf.key]);
    }
    if (!title) {
      const k = Object.keys(data).find((k) => String(data[k] ?? '').trim());
      if (k) title = String(data[k]);
    }
    title = (title || `${form.name} submission`).slice(0, 300);
    const labelOf = (k: string) => { const f = fields.find((ff) => ff.key === k); return f?.label || k; };
    const descr = Object.keys(data)
      .filter((k) => String(data[k] ?? '').trim() !== '' && String(data[k]) !== title)
      .map((k) => `<p><strong>${esc(labelOf(k))}:</strong> ${esc(String(data[k]))}</p>`)
      .join('');
    const task = await prisma.task.create({ data: { id: nanoid(10), projectId: form.projectId, name: title, descr, st: 'mut', pr: 'med' } });
    await prisma.formSubmission.create({ data: { formId: form.id, data: data as any, taskId: task.id } });
    emit(form.workspaceId, 'task.created', { task: taskDTO(task), taskId: task.id });
    res.json({ ok: true });
  }));

  // ======================= EVENT CATALOG ==================================
  app.get('/api/events/catalog', requireAuth, h(async (_req: any, res) => {
    res.json(EVENT_CATALOG);
  }));
}
