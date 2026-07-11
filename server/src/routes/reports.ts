import type { Express } from 'express';
import { z } from 'zod';
import {
  prisma, requireAuth, h, bad, HttpError,
  assertMember, workspaceOfProject, todayIdx, EP,
} from '../ctx.ts';

// ---- shared helpers --------------------------------------------------------
const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
// day index (from EP) for a real DateTime
const dayOf = (d: Date) => Math.floor((d.getTime() - EP) / 864e5);
// short label for a week bucket, keyed on the week's Monday day-index
const weekLabel = (weekStartDay: number) => {
  const dt = new Date(EP + weekStartDay * 864e5);
  return MO[dt.getUTCMonth()] + ' ' + dt.getUTCDate();
};
// EP is a Monday, so the current week's Monday is TODAY rounded down to a multiple of 7
const currentWeekStart = () => { const T = todayIdx(); return T - (((T % 7) + 7) % 7); };
// n ascending week-Monday indices ending with the current week (last N weeks incl. this one)
const lastNWeeks = (n: number) => { const ws = currentWeekStart(); return Array.from({ length: n }, (_, i) => ws - (n - 1 - i) * 7); };
// leaf predicate over a fetched task set: no other fetched task claims this one as parent.
// (We only fetch non-deleted tasks, so deleted children never keep a parent off the leaf list.)
const leafPredicate = (tasks: { id: string; parentId: string | null }[]) => {
  const parents = new Set(tasks.map((t) => t.parentId).filter(Boolean) as string[]);
  return (t: { id: string }) => !parents.has(t.id);
};

export function registerReportRoutes(app: Express) {
  // 1) BURNDOWN / BURNUP -----------------------------------------------------
  // GET /api/reports/burndown?projectId= -> { from,to,bucket,total,unit,points[] }
  // points: {day, ideal, remaining, completed}. Milestones (ms) and undated leaves
  // are excluded from the curve; "unit" is a task count (not summed estimate).
  app.get('/api/reports/burndown', requireAuth, h(async (req: any, res) => {
    const projectId = z.string().min(1).parse(req.query.projectId);
    await assertMember(req.user.id, await workspaceOfProject(projectId));
    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, parentId: true, ms: true, st: true, s: true, e: true },
    });
    const isLeaf = leafPredicate(tasks);
    const leaves = tasks.filter((t) => isLeaf(t) && !t.ms);
    const dated = leaves.filter((t) => t.s != null && t.e != null) as { st: string; s: number; e: number }[];
    if (!dated.length) return res.json({ projectId, from: null, to: null, bucket: 'day', total: 0, unit: 'count', points: [] });
    const from = Math.min(...dated.map((t) => t.s));
    const to = Math.max(...dated.map((t) => t.e));
    const total = dated.length;
    // cap the series at ~90 points: switch from daily to weekly buckets past that span
    const step = (to - from + 1) <= 90 ? 1 : 7;
    const days: number[] = [];
    for (let d = from; d <= to; d += step) days.push(d);
    if (days[days.length - 1] !== to) days.push(to);
    const n = days.length;
    const points = days.map((day, i) => ({
      day,
      ideal: n > 1 ? Math.round((total * (n - 1 - i) / (n - 1)) * 10) / 10 : 0,
      // remaining = open leaves whose work still extends to/past this day
      remaining: dated.filter((t) => t.st !== 'done' && t.e >= day).length,
      // completed = done leaves whose end has passed on/before this day (burnup)
      completed: dated.filter((t) => t.st === 'done' && t.e <= day).length,
    }));
    res.json({ projectId, from, to, bucket: step === 7 ? 'week' : 'day', total, unit: 'count', points });
  }));

  // 2) VELOCITY --------------------------------------------------------------
  // GET /api/reports/velocity?workspaceId= -> [{week:'Jul 6', done:n}] (last 6 weeks)
  // Counts non-deleted, non-milestone tasks whose st='done' and updatedAt lands in the week.
  app.get('/api/reports/velocity', requireAuth, h(async (req: any, res) => {
    const workspaceId = z.string().min(1).parse(req.query.workspaceId);
    await assertMember(req.user.id, workspaceId);
    const weeks = lastNWeeks(6);
    const rangeStart = new Date(EP + weeks[0] * 864e5);
    const rangeEnd = new Date(EP + (weeks[weeks.length - 1] + 7) * 864e5);
    const done = await prisma.task.findMany({
      where: { project: { workspaceId }, deletedAt: null, ms: false, st: 'done', updatedAt: { gte: rangeStart, lt: rangeEnd } },
      select: { updatedAt: true },
    });
    const counts = weeks.map(() => 0);
    for (const t of done) {
      const idx = Math.floor((dayOf(t.updatedAt) - weeks[0]) / 7);
      if (idx >= 0 && idx < weeks.length) counts[idx]++;
    }
    res.json(weeks.map((w, i) => ({ week: weekLabel(w), done: counts[i] })));
  }));

  // 3) CUMULATIVE FLOW -------------------------------------------------------
  // GET /api/reports/cfd?projectId= -> [{week, mut, prog, risk, bad, done}] (last 8 weeks)
  // Approximation (no per-status history is stored): a task "exists" once createdAt<=week.
  // For 'done' tasks we honour updatedAt (the completion time) and bucket them as 'prog'
  // for weeks before they were completed; all other statuses use the task's CURRENT status.
  app.get('/api/reports/cfd', requireAuth, h(async (req: any, res) => {
    const projectId = z.string().min(1).parse(req.query.projectId);
    await assertMember(req.user.id, await workspaceOfProject(projectId));
    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: { id: true, parentId: true, ms: true, st: true, createdAt: true, updatedAt: true },
    });
    const isLeaf = leafPredicate(tasks);
    const leaves = tasks.filter((t) => isLeaf(t) && !t.ms);
    const weeks = lastNWeeks(8);
    const rows = weeks.map((w) => ({ week: weekLabel(w), mut: 0, prog: 0, risk: 0, bad: 0, done: 0 }));
    for (const t of leaves) {
      const created = dayOf(t.createdAt);
      const doneDay = dayOf(t.updatedAt);
      for (let i = 0; i < weeks.length; i++) {
        const weekEnd = weeks[i] + 6;
        if (created > weekEnd) continue; // task did not exist yet in this week
        let bucket: 'mut' | 'prog' | 'risk' | 'bad' | 'done';
        if (t.st === 'done') bucket = doneDay <= weekEnd ? 'done' : 'prog';
        else bucket = (['mut', 'prog', 'risk', 'bad'] as const).includes(t.st as any) ? (t.st as any) : 'mut';
        rows[i][bucket]++;
      }
    }
    res.json(rows);
  }));

  // 4) TIMESHEET -------------------------------------------------------------
  // GET /api/reports/timesheet?workspaceId=&from=&to= (from/to = day indices, inclusive)
  // -> { users:[{userId,name,totalMinutes,byDay:{day:minutes}}], totalMinutes }
  app.get('/api/reports/timesheet', requireAuth, h(async (req: any, res) => {
    const q = z.object({
      workspaceId: z.string().min(1),
      from: z.coerce.number().int(),
      to: z.coerce.number().int(),
    }).safeParse(req.query);
    if (!q.success) return bad(res, q.error);
    if (q.data.to < q.data.from) throw new HttpError(400, 'to must be >= from');
    await assertMember(req.user.id, q.data.workspaceId);
    const entries = await prisma.timeEntry.findMany({
      where: { task: { project: { workspaceId: q.data.workspaceId } }, day: { gte: q.data.from, lte: q.data.to } },
      select: { userId: true, minutes: true, day: true },
    });
    const byUser = new Map<string, { userId: string; totalMinutes: number; byDay: Record<number, number> }>();
    let totalMinutes = 0;
    for (const e of entries) {
      totalMinutes += e.minutes;
      let u = byUser.get(e.userId);
      if (!u) { u = { userId: e.userId, totalMinutes: 0, byDay: {} }; byUser.set(e.userId, u); }
      u.totalMinutes += e.minutes;
      u.byDay[e.day] = (u.byDay[e.day] || 0) + e.minutes;
    }
    const names = await prisma.user.findMany({ where: { id: { in: [...byUser.keys()] } }, select: { id: true, name: true } });
    const nameById = Object.fromEntries(names.map((u) => [u.id, u.name]));
    const users = [...byUser.values()]
      .map((u) => ({ userId: u.userId, name: nameById[u.userId] || u.userId, totalMinutes: u.totalMinutes, byDay: u.byDay }))
      .sort((a, b) => b.totalMinutes - a.totalMinutes);
    res.json({ users, totalMinutes });
  }));

  // 5) WORKLOAD --------------------------------------------------------------
  // GET /api/reports/workload?workspaceId= -> { members:[{userId,weeks:number[8]}], weekLabels[8] }
  // Same rule as the bootstrap: 6h per weekday of each open, scheduled, assigned
  // (non-milestone) task, distributed across 8 forward-looking week buckets.
  app.get('/api/reports/workload', requireAuth, h(async (req: any, res) => {
    const workspaceId = z.string().min(1).parse(req.query.workspaceId);
    await assertMember(req.user.id, workspaceId);
    const memberships = await prisma.membership.findMany({ where: { workspaceId }, select: { userId: true } });
    const memberIds = [...new Set(memberships.map((m) => m.userId))];
    const weekStart = currentWeekStart();
    const weeks = Array.from({ length: 8 }, (_, i) => weekStart + i * 7);
    const rows: Record<string, number[]> = {};
    for (const id of memberIds) rows[id] = [0, 0, 0, 0, 0, 0, 0, 0];
    const tasks = await prisma.task.findMany({
      where: { project: { workspaceId }, deletedAt: null, ms: false, st: { not: 'done' }, assigneeId: { in: memberIds } },
      select: { assigneeId: true, s: true, e: true },
    });
    for (const t of tasks) {
      if (t.assigneeId == null || t.s == null || t.e == null) continue;
      const row = rows[t.assigneeId];
      if (!row) continue;
      for (let d = Math.max(t.s, weeks[0]); d <= Math.min(t.e, weeks[7] + 6); d++) {
        if (((d % 7) + 7) % 7 >= 5) continue; // skip weekends
        row[Math.floor((d - weeks[0]) / 7)] += 6;
      }
    }
    res.json({
      members: memberIds.map((userId) => ({ userId, weeks: rows[userId] })),
      weekLabels: weeks.map(weekLabel),
    });
  }));

  // 6) PORTFOLIO (RAG rollup) ------------------------------------------------
  // GET /api/reports/portfolio?workspaceId= -> [{id,name,st,prog,owner,overdueCount,taskCount,doneCount,lastStatusUpdate}]
  // Counts exclude soft-deleted and milestone tasks; overdue = open task past its end day.
  app.get('/api/reports/portfolio', requireAuth, h(async (req: any, res) => {
    const workspaceId = z.string().min(1).parse(req.query.workspaceId);
    await assertMember(req.user.id, workspaceId);
    const TODAY = todayIdx();
    const projects = await prisma.project.findMany({
      where: { workspaceId, archived: false, isTemplate: false },
      select: { id: true, name: true, st: true, prog: true, ownerId: true },
    });
    const pids = projects.map((p) => p.id);
    const [tasks, updates] = await Promise.all([
      prisma.task.findMany({ where: { projectId: { in: pids }, deletedAt: null, ms: false }, select: { projectId: true, st: true, e: true } }),
      prisma.statusUpdate.findMany({ where: { projectId: { in: pids } }, orderBy: { createdAt: 'desc' }, select: { projectId: true, createdAt: true } }),
    ]);
    const lastUpdate: Record<string, Date> = {};
    for (const u of updates) if (!lastUpdate[u.projectId]) lastUpdate[u.projectId] = u.createdAt; // desc order → first seen is latest
    const agg: Record<string, { taskCount: number; doneCount: number; overdueCount: number }> = {};
    for (const p of pids) agg[p] = { taskCount: 0, doneCount: 0, overdueCount: 0 };
    for (const t of tasks) {
      const a = agg[t.projectId];
      a.taskCount++;
      if (t.st === 'done') a.doneCount++;
      else if (t.e != null && t.e < TODAY) a.overdueCount++;
    }
    res.json(projects.map((p) => ({
      id: p.id, name: p.name, st: p.st, prog: p.prog, owner: p.ownerId,
      overdueCount: agg[p.id].overdueCount, taskCount: agg[p.id].taskCount, doneCount: agg[p.id].doneCount,
      lastStatusUpdate: lastUpdate[p.id] ?? null,
    })));
  }));

  // 7) SCHEDULE A REPORT -----------------------------------------------------
  // POST /api/reports/schedule {workspaceId,cadence,email}. No ScheduledReport model
  // exists, so we persist the request as an AuditLog entry; real delivery will hook
  // into notify.ts once SMTP is configured.
  app.post('/api/reports/schedule', requireAuth, h(async (req: any, res) => {
    const p = z.object({
      workspaceId: z.string().min(1),
      cadence: z.enum(['weekly', 'daily']),
      email: z.string().email(),
    }).safeParse(req.body);
    if (!p.success) return bad(res, p.error);
    await assertMember(req.user.id, p.data.workspaceId);
    await prisma.auditLog.create({
      data: {
        workspaceId: p.data.workspaceId,
        actorId: req.user.id,
        action: 'report.scheduled',
        target: p.data.email,
        meta: { cadence: p.data.cadence, email: p.data.email },
      },
    });
    res.json({ ok: true, note: 'scheduled — delivered when SMTP is configured' });
  }));
}
