// Lightweight in-process schedulers. In a multi-instance deploy move these to a
// job runner; for a single container they run on a timer.
import { prisma } from './prisma.ts';
import { todayIdx } from './ctx.ts';
import { emit } from './events.ts';
import { runRules } from './rules.ts';
import { sendDigest } from './notify.ts';

export function startSchedulers() {
  // hourly-ish tick (every 30 min) — cheap, idempotent
  const tick = async () => {
    try { await purgeTrash(); } catch { /* ignore */ }
    try { await dueSoon(); } catch { /* ignore */ }
    try { await rollRecurring(); } catch { /* ignore */ }
  };
  setTimeout(tick, 10_000);
  setInterval(tick, 30 * 60 * 1000);

  // daily digest at ~08:00 server time (checked every 30 min)
  let lastDigestDay = -1;
  setInterval(async () => {
    const now = new Date();
    if (now.getHours() === 8 && now.getDate() !== lastDigestDay) {
      lastDigestDay = now.getDate();
      try { await sendDigest('daily'); } catch { /* ignore */ }
    }
  }, 30 * 60 * 1000);
}

// Permanently remove tasks and projects trashed > 30 days ago.
async function purgeTrash() {
  const cutoff = new Date(Date.now() - 30 * 864e5);
  await prisma.task.deleteMany({ where: { deletedAt: { lt: cutoff } } });
  await prisma.project.deleteMany({ where: { deletedAt: { lt: cutoff } } });
}

// Fire due.soon rules for tasks due within 2 days and not done.
async function dueSoon() {
  const T = todayIdx();
  const tasks = await prisma.task.findMany({
    where: { deletedAt: null, ms: false, st: { not: 'done' }, e: { gte: T, lte: T + 2 } },
    select: { id: true, name: true, project: { select: { workspaceId: true } } },
  });
  for (const t of tasks) {
    await runRules(t.project.workspaceId, 'due.soon' as any, { taskId: t.id, task: { id: t.id, name: t.name } });
  }
}

// Materialize the next occurrence of daily/weekly/monthly recurring tasks once
// the current instance's due date has passed.
async function rollRecurring() {
  const T = todayIdx();
  const recs = await prisma.task.findMany({ where: { deletedAt: null, recurrence: { not: null }, e: { lt: T } } });
  for (const t of recs) {
    if (t.s == null || t.e == null) continue;
    const step = t.recurrence === 'daily' ? 1 : t.recurrence === 'weekly' ? 7 : t.recurrence === 'monthly' ? 30 : 0;
    if (!step) continue;
    const dur = t.e - t.s;
    let ns = t.s + step;
    while (ns + dur < T) ns += step; // catch up to now
    // move the recurring task forward and reset progress
    const updated = await prisma.task.update({ where: { id: t.id }, data: { s: ns, e: ns + dur, st: 'mut', pg: 0 } });
    emit(t.projectId /* workspace resolved in emit via ws lookups not needed here */, 'task.updated', { taskId: updated.id, task: { id: updated.id } });
  }
}
