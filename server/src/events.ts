// Central event bus. Every meaningful mutation emits an event; this fans it out to:
//   1. WebSocket clients in the workspace (real-time live update)
//   2. Outgoing webhooks subscribed to the event (HMAC-signed)
//   3. Automation rules whose trigger matches
//   4. In-app notifications for watchers/assignees
import { createHmac } from 'node:crypto';
import { prisma } from './prisma.ts';
import { broadcast } from './ws.ts';
import { runRules } from './rules.ts';

export type VeloxEvent =
  | 'task.created' | 'task.updated' | 'status.changed' | 'task.deleted'
  | 'comment.added' | 'project.at_risk' | 'milestone.completed' | 'status_update.posted';

export async function emit(workspaceId: string, event: VeloxEvent, payload: any, actorId?: string) {
  // 1. realtime
  broadcast(workspaceId, { type: event, payload });

  // 2. webhooks (fire-and-forget, logged)
  deliverWebhooks(workspaceId, event, payload).catch(() => {});

  // 3. rules
  runRules(workspaceId, event, payload, actorId).catch(() => {});

  // 4. notifications for task events (watchers + assignees, excluding the actor)
  if (payload?.task || payload?.taskId) {
    createTaskNotifications(event, payload, actorId).catch(() => {});
  }
}

async function deliverWebhooks(workspaceId: string, event: string, payload: any) {
  const hooks = await prisma.webhook.findMany({ where: { workspaceId, active: true } });
  const body = JSON.stringify({ event, ts: Date.now(), data: payload });
  for (const hook of hooks) {
    const events = (hook.events as string[]) || [];
    if (events.length && !events.includes(event)) continue;
    const sig = createHmac('sha256', hook.secret).update(body).digest('hex');
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 8000);
      const res = await fetch(hook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Velox-Event': event, 'X-Velox-Signature': `sha256=${sig}` },
        body, signal: controller.signal,
      }).finally(() => clearTimeout(t));
      await prisma.webhookDelivery.create({ data: { webhookId: hook.id, event, status: res.status, ok: res.ok } });
    } catch {
      await prisma.webhookDelivery.create({ data: { webhookId: hook.id, event, status: null, ok: false } });
    }
  }
}

async function createTaskNotifications(event: string, payload: any, actorId?: string) {
  const taskId = payload.taskId || payload.task?.id;
  if (!taskId) return;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    include: { assignees: true, watchers: true },
  });
  if (!task) return;
  const recipients = new Set<string>();
  if (task.assigneeId) recipients.add(task.assigneeId);
  task.assignees.forEach((a) => recipients.add(a.userId));
  task.watchers.forEach((w) => recipients.add(w.userId));
  if (actorId) recipients.delete(actorId);
  if (!recipients.size) return;
  const text = {
    'task.updated': `"${task.name}" was updated`,
    'status.changed': `"${task.name}" status changed to ${payload.st ?? task.st}`,
    'comment.added': `New comment on "${task.name}"`,
    'task.created': `You were added to "${task.name}"`,
  }[event] || `Activity on "${task.name}"`;
  const kind = event === 'comment.added' ? 'comment' : event === 'status.changed' ? 'status' : 'assign';
  const ic = event === 'comment.added' ? '💬' : event === 'status.changed' ? '⟳' : '👤';
  for (const userId of recipients) {
    await prisma.notification.create({
      data: { id: `n_${Math.random().toString(36).slice(2, 11)}`, userId, kind, ic, unread: true, whenTxt: 'just now', txt: text, ref: taskId, ord: -Date.now() },
    });
    broadcast('user:' + userId, { type: 'notification', payload: { taskId, text } });
  }
}
