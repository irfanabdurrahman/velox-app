// Automation rules: "When <trigger> then <action>".
// Triggers: status.changed (to a value), task.created, comment.added, due.soon (evaluated by a scheduler).
// Actions: set_status, assign, add_comment, notify, call_webhook.
import { createHmac } from 'node:crypto';
import { prisma } from './prisma.ts';
import { broadcast } from './ws.ts';

export async function runRules(workspaceId: string, event: string, payload: any, actorId?: string) {
  const rules = await prisma.rule.findMany({ where: { workspaceId, active: true } });
  for (const rule of rules) {
    const trigger = rule.trigger as any;
    if (trigger?.type !== event) continue;
    // optional match, e.g. only when status changed to a specific value
    if (trigger.to && payload.st && payload.st !== trigger.to) continue;
    await applyAction(rule.action as any, payload, actorId).catch(() => {});
  }
}

async function applyAction(action: any, payload: any, actorId?: string) {
  const taskId = payload.taskId || payload.task?.id;
  switch (action?.type) {
    case 'set_status':
      if (taskId && action.value) {
        const t = await prisma.task.update({ where: { id: taskId }, data: { st: action.value } });
        broadcast((await wsOf(taskId)) || '', { type: 'task.updated', payload: { task: t } });
      }
      break;
    case 'assign':
      if (taskId && action.userId) await prisma.task.update({ where: { id: taskId }, data: { assigneeId: action.userId } });
      break;
    case 'add_comment':
      if (taskId && action.text) await prisma.comment.create({ data: { taskId, authorId: null, whenTxt: 'automation', txt: action.text, rx: [] } });
      break;
    case 'notify':
      if (action.userId) await prisma.notification.create({ data: { id: `n_${Math.random().toString(36).slice(2, 11)}`, userId: action.userId, kind: 'ai', ic: '⚙', unread: true, whenTxt: 'just now', txt: action.text || 'Automation triggered', ref: taskId ?? null, ord: -Date.now() } });
      break;
    case 'call_webhook':
      if (action.url) {
        const body = JSON.stringify({ trigger: 'rule', payload });
        const headers: Record<string, string> = { 'Content-Type': 'application/json' };
        if (action.secret) headers['X-Velox-Signature'] = 'sha256=' + createHmac('sha256', action.secret).update(body).digest('hex');
        fetch(action.url, { method: 'POST', headers, body }).catch(() => {});
      }
      break;
  }
}

async function wsOf(taskId: string): Promise<string | null> {
  const t = await prisma.task.findUnique({ where: { id: taskId }, select: { project: { select: { workspaceId: true } } } });
  return t?.project.workspaceId ?? null;
}
