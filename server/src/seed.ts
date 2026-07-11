import 'dotenv/config';
import { hash } from '@node-rs/argon2';
import { prisma } from './prisma.ts';
import * as data from './data.ts';
import type { Role } from '@prisma/client';

const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };
const roleOf = (r: string): Role =>
  (({ Admin: 'ADMIN', Manager: 'MANAGER', Member: 'MEMBER', Guest: 'GUEST', 'Executive Viewer': 'EXEC_VIEWER' } as Record<string, Role>)[r] || 'MEMBER');

export async function seed() {
  // Clear (order respects FKs; cascades handle the rest)
  await prisma.$transaction([
    prisma.refreshToken.deleteMany(),
    prisma.chatMessage.deleteMany(),
    prisma.chatChannelMember.deleteMany(),
    prisma.chatChannel.deleteMany(),
    prisma.comment.deleteMany(),
    prisma.fileAsset.deleteMany(),
    prisma.notification.deleteMany(),
    prisma.task.deleteMany(),
    prisma.project.deleteMany(),
    prisma.membership.deleteMany(),
    prisma.category.deleteMany(),
    prisma.workspace.deleteMany(),
    prisma.user.deleteMany(),
  ]);

  // Demo accounts are only created when seeding is explicitly enabled; the shared
  // password is configurable so operators can rotate it away from the default.
  const demoHash = await hash(process.env.SEED_DEMO_PASSWORD || 'demo', ARGON);

  // Users (seeded team members double as login accounts; password: "demo")
  for (const [id, m] of Object.entries(data.members)) {
    await prisma.user.create({
      data: { id, email: m.email, name: m.n, passwordHash: demoHash, initials: id, color: m.c, isRegistered: false },
    });
  }

  await prisma.workspace.createMany({ data: data.workspaces });
  await prisma.category.createMany({ data: data.categories });

  // Memberships: everyone in DX; a few in IT; demo user (BS) owns his workspaces.
  const inIT = new Set(['BS', 'AP', 'HG', 'AW']);
  for (const [id, m] of Object.entries(data.members)) {
    await prisma.membership.create({ data: { userId: id, workspaceId: 'dx', role: id === 'BS' ? 'OWNER' : roleOf(m.role) } });
    if (inIT.has(id)) await prisma.membership.create({ data: { userId: id, workspaceId: 'it', role: id === 'BS' ? 'ADMIN' : roleOf(m.role) } });
  }
  await prisma.membership.create({ data: { userId: 'BS', workspaceId: 'personal', role: 'OWNER' } });

  for (const p of data.projects) {
    await prisma.project.create({
      data: { id: p.id, name: p.name, code: p.code, workspaceId: p.ws, categoryId: p.cat, ownerId: p.owner, st: p.st, prog: p.prog, due: p.due, color: p.color },
    });
  }

  // Tasks: insert parents first so parentId FKs resolve.
  const ordered = [...data.tasks].sort((a, b) => (a.par ? 1 : 0) - (b.par ? 1 : 0));
  // handle 2-level nesting: sort by depth
  const depth = (t: any): number => (t.par ? 1 + depth(data.tasks.find((x) => x.id === t.par) || {}) : 0);
  ordered.sort((a, b) => depth(a) - depth(b));
  for (const t of ordered) {
    await prisma.task.create({
      data: {
        id: t.id, projectId: t.pid, parentId: t.par ?? null, name: t.name, assigneeId: t.a ?? null,
        pr: t.pr ?? 'med', pg: t.pg ?? 0, st: t.st ?? 'mut', s: t.s, e: t.e,
        ms: !!t.ms, crit: !!t.crit, bs: t.bs ?? null, be: t.be ?? null,
        lbl: t.lbl ?? [], deps: t.deps ?? [], est: data.est[t.id] ?? null, tt: data.tt[t.id] ?? null,
      },
    });
  }

  // Sections + custom fields + a weekly status update on the hero project.
  await prisma.section.create({ data: { projectId: 'karawang', name: 'Site & Permits', ord: 0 } });
  await prisma.section.create({ data: { projectId: 'karawang', name: 'Relocation', ord: 1 } });
  await prisma.customField.create({ data: { projectId: 'karawang', name: 'Cost (Rp jt)', kind: 'currency', config: { code: 'IDR' }, ord: 0 } });
  await prisma.customField.create({ data: { projectId: 'karawang', name: 'Vendor', kind: 'text', ord: 1 } });
  await prisma.statusUpdate.create({ data: { projectId: 'karawang', authorId: 'AW', status: 'risk', summary: 'Permit (IMB) still with the agency; PLN energize on the critical path. Escalation meeting scheduled Thursday.' } });

  for (const [tid, list] of Object.entries(data.seedComments))
    for (const c of list)
      await prisma.comment.create({ data: { id: c.id, taskId: tid, authorId: c.who, whenTxt: c.when, txt: c.txt, rx: c.rx } });

  let fi = 0;
  for (const [tid, list] of Object.entries(data.seedFiles))
    for (const f of list)
      await prisma.fileAsset.create({ data: { id: `f${fi++}`, taskId: tid, n: f.n, s: f.s, k: f.k } });

  // Inbox belongs to the demo user (BS).
  await prisma.notification.createMany({
    data: data.inbox.map((n, i) => ({ id: n.id, userId: 'BS', kind: n.kind, ic: n.ic, unread: !!n.unread, whenTxt: n.when, txt: n.txt, ref: n.ref ?? null, who: n.who ?? null, go: n.go ?? null, ord: i })),
  });

  const chanWs: Record<string, string | null> = { krw: 'dx', dx: 'dx', gln: 'dx', dmSR: null, dmDP: null };
  await prisma.chatChannel.createMany({ data: data.chatChannels.map((c, i) => ({ id: c.id, kind: c.kind, name: c.name, ord: i, workspaceId: chanWs[c.id] ?? null })) });
  // DM participants: DMs are private to their two members.
  const dmMembers: Record<string, string[]> = { dmSR: ['BS', 'SR'], dmDP: ['BS', 'DP'] };
  for (const [chan, users] of Object.entries(dmMembers))
    for (const userId of users) await prisma.chatChannelMember.create({ data: { channelId: chan, userId } });
  for (const [chan, list] of Object.entries(data.chatMsgs))
    for (let i = 0; i < list.length; i++) {
      const m = list[i];
      await prisma.chatMessage.create({ data: { channelId: chan, authorId: m.who, whenTxt: m.when, txt: m.txt, ref: m.ref ?? null, ord: i } });
    }

  console.log('Velox PostgreSQL database seeded.');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  seed().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
}
