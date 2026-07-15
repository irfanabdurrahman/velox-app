// Canonical Velox sample data, transcribed from the Claude Design prototype.
// Dates are stored as day-indices relative to EP (Mon Jun 29 2026), matching the
// Gantt math in the prototype. Helper D(month, day) -> day index.

export const EP = Date.UTC(2026, 5, 29); // day 0 = Mon Jun 29 2026
// "Today" tracks the real clock so overdue logic, the TODAY line, and AI context
// stay correct as time passes (never below day 0).
export const todayIdx = () => Math.max(0, Math.floor((Date.now() - EP) / 864e5));
export const D = (m: number, d: number) => Math.round((Date.UTC(2026, m - 1, d) - EP) / 864e5);

export const members: Record<string, { n: string; c: string; role: string; email: string }> = {
  BS: { n: 'Budi Santoso', c: '#6366F1', role: 'Admin', email: 'budi.s@company.co.id' },
  SR: { n: 'Sari Rahma', c: '#D97706', role: 'Manager', email: 'sari.r@company.co.id' },
  AW: { n: 'Andi Wijaya', c: '#0891B2', role: 'Manager', email: 'andi.w@company.co.id' },
  DP: { n: 'Dewi Putri', c: '#16A34A', role: 'Member', email: 'dewi.p@company.co.id' },
  RH: { n: 'Rizky Hidayat', c: '#BE185D', role: 'Member', email: 'rizky.h@company.co.id' },
  MK: { n: 'Maya Kusuma', c: '#7C3AED', role: 'Member', email: 'maya.k@company.co.id' },
  AP: { n: 'Agus Prasetyo', c: '#2563EB', role: 'Member', email: 'agus.p@company.co.id' },
  FN: { n: 'Fajar Nugroho', c: '#0D9488', role: 'Member', email: 'fajar.n@company.co.id' },
  IP: { n: 'Intan Permata', c: '#E11D48', role: 'Member', email: 'intan.p@company.co.id' },
  HG: { n: 'Hendra Gunawan', c: '#475569', role: 'Guest', email: 'hendra.g@vendor.co.id' },
  HW: { n: 'Haryo Wibowo', c: '#334155', role: 'Executive Viewer', email: 'haryo.w@company.co.id' },
};

// Categories are workspace-scoped now — each row needs its own id (Category.id
// has no @default in raw createMany, so these are minted explicitly) and ws.
export const categories = [
  { id: 'dt', label: 'Digital Transformation', color: '#0EA5E9', workspaceId: 'dx', ord: 0 },
  { id: 'sf', label: 'Smart Factory', color: '#10B981', workspaceId: 'dx', ord: 1 },
  { id: 'infra', label: 'Infrastructure', color: '#6366F1', workspaceId: 'dx', ord: 2 },
  { id: 'kaizen', label: 'Kaizen / QCC', color: '#F59E0B', workspaceId: 'dx', ord: 3 },
  { id: 'it', label: 'IT Operations', color: '#64748B', workspaceId: 'it', ord: 0 },
];

export const workspaces = [
  { id: 'dx', name: 'DX Department', color: '#6366F1', ini: 'DX', meta: '8 projects' },
  { id: 'it', name: 'IT Division', color: '#0EA5E9', ini: 'IT', meta: '2 projects' },
  { id: 'personal', name: 'Personal', color: '#64748B', ini: 'P', meta: '0 projects' },
];

export const projects = [
  { id: 'karawang', name: 'Karawang Relocation Project', code: 'KR', cat: 'infra', ws: 'dx', owner: 'AW', st: 'risk', prog: 34, due: D(10, 5), color: '#6366F1' },
  { id: 'gln', name: 'GLN Wave 17 Preparation', code: 'GL', cat: 'dt', ws: 'dx', owner: 'SR', st: 'risk', prog: 61, due: D(9, 30), color: '#0EA5E9' },
  { id: 'cmp2', name: 'Connected Manufacturing P2', code: 'CM', cat: 'sf', ws: 'dx', owner: 'BS', st: 'ok', prog: 48, due: D(11, 16), color: '#10B981' },
  { id: 'aisoc', name: 'AI Socialization Program', code: 'AI', cat: 'dt', ws: 'dx', owner: 'MK', st: 'ok', prog: 72, due: D(8, 28), color: '#8B5CF6' },
  { id: 'helpdesk', name: 'IT Helpdesk Automation', code: 'HD', cat: 'infra', ws: 'dx', owner: 'RH', st: 'bad', prog: 55, due: D(7, 3), color: '#F97316' },
  { id: 'poemail', name: 'PO Email Extraction PoC', code: 'PO', cat: 'dt', ws: 'dx', owner: 'FN', st: 'ok', prog: 83, due: D(7, 31), color: '#14B8A6' },
  { id: 'cqi', name: 'Cognitive Quality Inspection', code: 'CQ', cat: 'sf', ws: 'dx', owner: 'DP', st: 'risk', prog: 26, due: D(12, 18), color: '#EC4899' },
  { id: 'qcc12', name: 'QCC Batch 12 Facilitation', code: 'QC', cat: 'kaizen', ws: 'dx', owner: 'IP', st: 'risk', prog: 38, due: D(9, 11), color: '#F59E0B' },
  { id: 'netref', name: 'Network Refresh 2026', code: 'NR', cat: 'it', ws: 'it', owner: 'HG', st: 'ok', prog: 41, due: D(10, 30), color: '#3B82F6' },
  { id: 'itsm', name: 'ITSM Rollout', code: 'IR', cat: 'it', ws: 'it', owner: 'AP', st: 'mut', prog: 8, due: D(12, 4), color: '#64748B' },
];

type TaskSeed = {
  id: string; pid: string; par?: string | null; name: string; a?: string | null;
  pr?: string; pg?: number; st?: string; s: number | null; e: number | null;
  ms?: boolean; crit?: boolean; deps?: { t: string; crit?: boolean }[];
  bs?: number; be?: number; lbl?: string[];
};

const T = (o: Partial<TaskSeed> & { id: string; pid: string; name: string; s: number | null; e: number | null }): TaskSeed =>
  Object.assign({ par: null, a: null, pr: 'med', pg: 0, deps: [], ms: false, crit: false, st: 'mut', lbl: [] }, o) as TaskSeed;

export const tasks: TaskSeed[] = [
  T({ id: 't1', pid: 'karawang', name: 'Site Preparation', s: D(7, 6), e: D(7, 29), st: 'prog', pg: 58, crit: true }),
  T({ id: 't2', pid: 'karawang', par: 't1', name: 'Land clearing & grading', a: 'AW', st: 'done', s: D(7, 6), e: D(7, 15), pg: 100, crit: true }),
  T({ id: 't2b', pid: 'karawang', par: 't1', name: 'Soil compaction test', a: 'HG', st: 'bad', s: D(7, 7), e: D(7, 8), pg: 80 }),
  T({ id: 't3', pid: 'karawang', par: 't1', name: 'Permit finalization (IMB)', a: 'SR', st: 'risk', s: D(7, 13), e: D(7, 24), pg: 35, pr: 'high', bs: D(7, 13), be: D(7, 21), lbl: ['Perizinan', 'External'] }),
  T({ id: 't4', pid: 'karawang', par: 't1', name: 'Utility rerouting (PLN)', a: 'BS', st: 'prog', s: D(7, 16), e: D(7, 29), pg: 60, deps: [{ t: 't2', crit: true }], crit: true, bs: D(7, 14), be: D(7, 27), lbl: ['External'] }),
  T({ id: 't5', pid: 'karawang', par: 't4', name: 'PLN approval & energize', a: 'BS', s: D(7, 23), e: D(7, 29), crit: true }),
  T({ id: 't6', pid: 'karawang', name: 'Machine Relocation', s: D(8, 3), e: D(8, 28), crit: true }),
  T({ id: 't7', pid: 'karawang', par: 't6', name: 'Line 3 disassembly', a: 'DP', s: D(8, 3), e: D(8, 12), deps: [{ t: 't5', crit: true }, { t: 't3' }], crit: true }),
  T({ id: 't8', pid: 'karawang', par: 't6', name: 'Transport & rigging', a: 'RH', s: D(8, 13), e: D(8, 19), deps: [{ t: 't7', crit: true }], crit: true, pr: 'high' }),
  T({ id: 't9', pid: 'karawang', par: 't6', name: 'Line 3 reassembly', a: 'DP', s: D(8, 20), e: D(8, 27), deps: [{ t: 't8', crit: true }], crit: true }),
  T({ id: 't10', pid: 'karawang', name: 'Production restart', ms: true, s: D(8, 28), e: D(8, 28), deps: [{ t: 't9', crit: true }], crit: true }),
  T({ id: 't11', pid: 'karawang', name: 'IT & Facility Fit-out', s: D(9, 1), e: D(10, 2) }),
  T({ id: 't12', pid: 'karawang', par: 't11', name: 'Network & server room build', a: 'FN', s: D(9, 1), e: D(9, 18) }),
  T({ id: 't13', pid: 'karawang', par: 't11', name: 'MES/SCADA reconnection', a: 'AP', s: D(9, 21), e: D(10, 2), deps: [{ t: 't12' }] }),
  T({ id: 't14', pid: 'karawang', par: 't11', name: 'Safety certification (K3)', a: 'IP', st: 'risk', s: D(9, 14), e: D(9, 25), pr: 'high' }),
  T({ id: 't15', pid: 'karawang', name: 'Full capacity reached', ms: true, s: D(10, 5), e: D(10, 5), deps: [{ t: 't13' }, { t: 't14' }] }),
  T({ id: 'g1', pid: 'gln', name: 'SIT environment readiness', a: 'FN', st: 'prog', s: D(7, 1), e: D(7, 17), pg: 55 }),
  T({ id: 'g2', pid: 'gln', name: 'Wave 17 UAT execution', a: 'SR', st: 'risk', s: D(7, 13), e: D(8, 1), pg: 20, pr: 'high', bs: D(7, 9), be: D(7, 28) }),
  T({ id: 'g2a', pid: 'gln', par: 'g2', name: 'UAT scenario pack', a: 'IP', st: 'done', s: D(7, 13), e: D(7, 17), pg: 100 }),
  T({ id: 'g2b', pid: 'gln', par: 'g2', name: 'Defect triage cadence', a: 'SR', st: 'prog', s: D(7, 16), e: D(7, 31), pg: 30 }),
  T({ id: 'g2c', pid: 'gln', par: 'g2', name: 'Business sign-off gate', a: 'MK', s: D(7, 30), e: D(8, 1) }),
  T({ id: 'g3', pid: 'gln', name: 'Cutover rehearsal', a: 'BS', s: D(7, 10), e: D(7, 10), pr: 'high' }),
  T({ id: 'g4', pid: 'gln', name: 'Data migration dry-run 2', a: 'AP', st: 'bad', s: D(7, 3), e: D(7, 8), pg: 60 }),
  T({ id: 'g5', pid: 'gln', name: 'Hypercare staffing plan', a: 'MK', s: D(7, 20), e: D(7, 24) }),
  T({ id: 'c1', pid: 'cmp2', name: 'PO mapping review', a: 'BS', st: 'bad', s: D(7, 6), e: D(7, 8), pg: 40 }),
  T({ id: 'c2', pid: 'cmp2', name: 'OPC-UA gateway config', a: 'AP', st: 'prog', s: D(7, 8), e: D(7, 22), pg: 52 }),
  T({ id: 'c3', pid: 'cmp2', name: 'Line dashboard v2', a: 'DP', s: D(7, 27), e: D(8, 14) }),
  T({ id: 'a1', pid: 'aisoc', name: 'Dept roadshow batch 3', a: 'MK', st: 'prog', s: D(7, 6), e: D(7, 17), pg: 65 }),
  T({ id: 'a2', pid: 'aisoc', name: 'Champion onboarding', a: 'SR', st: 'done', s: D(6, 29), e: D(7, 8), pg: 100 }),
  T({ id: 'a3', pid: 'aisoc', name: 'Weekly DX steering deck', a: 'BS', s: D(7, 12), e: D(7, 12) }),
  T({ id: 'h1', pid: 'helpdesk', name: 'Chatbot intent library', a: 'RH', st: 'bad', s: D(6, 29), e: D(7, 4), pg: 70 }),
  T({ id: 'h2', pid: 'helpdesk', name: 'KB article migration', a: 'IP', st: 'bad', s: D(6, 30), e: D(7, 2), pg: 55 }),
  T({ id: 'h3', pid: 'helpdesk', name: 'Agent training deck', a: 'MK', st: 'bad', s: D(7, 1), e: D(7, 6), pg: 30 }),
  T({ id: 'h4', pid: 'helpdesk', name: 'SLA dashboard', a: 'AP', st: 'prog', s: D(7, 6), e: D(7, 17), pg: 45 }),
  T({ id: 'p1', pid: 'poemail', name: 'Parser accuracy tuning', a: 'FN', st: 'prog', s: D(7, 1), e: D(7, 15), pg: 83 }),
  T({ id: 'p2', pid: 'poemail', name: 'UAT with procurement', a: 'SR', s: D(7, 20), e: D(7, 24) }),
  T({ id: 'p3', pid: 'poemail', name: 'API scope review', a: 'BS', s: D(7, 23), e: D(7, 24) }),
  T({ id: 'q1', pid: 'cqi', name: 'Camera vendor PO', a: 'DP', st: 'risk', s: D(7, 6), e: D(7, 24), pg: 20, pr: 'high' }),
  T({ id: 'q2', pid: 'cqi', name: 'Dataset labeling sprint', a: 'IP', st: 'prog', s: D(7, 13), e: D(7, 31), pg: 35 }),
  T({ id: 'b1', pid: 'karawang', name: 'Vendor security assessment', s: null, e: null }),
  T({ id: 'b2', pid: 'karawang', name: 'Spare parts inventory audit', s: null, e: null }),
  T({ id: 'k1', pid: 'qcc12', name: 'Batch 12 schedule confirm', a: 'IP', st: 'bad', s: D(7, 6), e: D(7, 9), pg: 50 }),
  T({ id: 'k2', pid: 'qcc12', name: 'Facilitator pairing', a: 'IP', st: 'prog', s: D(7, 13), e: D(7, 17), pg: 60 }),
];

export const seedComments: Record<string, { id: string; who: string; when: string; txt: string; rx: [string, number][] }[]> = {
  t3: [
    { id: 'cm1', who: 'SR', when: 'Yesterday 16:42', txt: 'Update: dokumen ANDALALIN masih menunggu tanda tangan dinas. @Budi bisa bantu eskalasi ke Pak Haryo minggu ini?', rx: [['👍', 2], ['🙏', 1]] },
    { id: 'cm2', who: 'BS', when: 'Yesterday 17:05', txt: 'On it — sudah saya jadwalkan meeting Kamis dengan tim perizinan. Will report back.', rx: [['🔥', 1]] },
  ],
  g2: [{ id: 'cm3', who: 'SR', when: 'Mon 09:12', txt: 'Vendor SIT environment slip 4 hari. @Maya tolong siapkan opsi kompresi jadwal UAT.', rx: [] }],
};

export const seedFiles: Record<string, { n: string; s: string; k: string }[]> = {
  t3: [{ n: 'site-layout-v3.pdf', s: '2.4 MB', k: 'pdf' }, { n: 'imb-checklist.xlsx', s: '88 KB', k: 'xls' }, { n: 'lokasi-gerbang.jpg', s: '1.1 MB', k: 'img' }],
  t4: [{ n: 'pln-sld-diagram.pdf', s: '3.0 MB', k: 'pdf' }],
};

export const est: Record<string, string> = { t3: '40h', t4: '64h', t7: '80h', g2: '120h', t8: '36h' };
export const tt: Record<string, string> = { t3: '14h 30m', t4: '38h 15m', g2: '22h' };

export const inbox = [
  { id: 'n1', kind: 'ai', ic: '✦', unread: true, when: '8m ago', txt: 'GLN Wave 17 predicted to slip 5 days — vendor SIT delay is compressing UAT.', ref: 'g2', who: null, go: null },
  { id: 'n2', kind: 'mention', ic: '@', unread: true, who: 'SR', when: '1h ago', txt: 'Sari Rahma mentioned you in "Permit finalization (IMB)": "…bisa bantu eskalasi ke Pak Haryo?"', ref: 't3', go: null },
  { id: 'n3', kind: 'assign', ic: '👤', unread: true, who: 'DP', when: '3h ago', txt: 'Dewi Putri assigned you "Cutover rehearsal" — due today.', ref: 'g3', go: null },
  { id: 'n4', kind: 'status', ic: '⟳', unread: true, when: 'Yesterday', txt: '"Data migration dry-run 2" changed status: In progress → Overdue.', ref: 'g4', who: null, go: null },
  { id: 'n5', kind: 'ai', ic: '✦', unread: false, when: 'Yesterday', txt: 'Workload alert: Dewi Putri is over capacity in week of Aug 17 (52h / 40h).', ref: null, go: 'workload', who: null },
  { id: 'n6', kind: 'comment', ic: '💬', unread: false, when: '2d ago', txt: 'Budi Santoso replied in "Permit finalization (IMB)".', ref: 't3', who: null, go: null },
];

export const chatChannels = [
  { id: 'krw', kind: 'channel', name: 'karawang-relocation' },
  { id: 'dx', kind: 'channel', name: 'dx-department' },
  { id: 'gln', kind: 'channel', name: 'gln-wave-17' },
  { id: 'dmSR', kind: 'dm', name: 'Sari Rahma' },
  { id: 'dmDP', kind: 'dm', name: 'Dewi Putri' },
];

export const chatMsgs: Record<string, { who: string; when: string; txt: string; ref?: string }[]> = {
  krw: [
    { who: 'AW', when: '09:14', txt: 'Tim, kick-off minggu depan fokus ke jalur kritis relokasi. Mohon update masing-masing workstream.' },
    { who: 'SR', when: '09:20', txt: 'Permit IMB masih di dinas — kemungkinan perlu eskalasi. Detail di task ini:', ref: 't3' },
    { who: 'BS', when: '09:26', txt: 'PLN sudah confirm survey ulang Jumat. Transport & rigging perlu vendor backup kalau slip.' },
    { who: 'DP', when: '09:31', txt: 'Disassembly checklist Line 3 draft selesai, review bareng besok jam 10?' },
  ],
  dx: [
    { who: 'MK', when: 'Yesterday', txt: 'Roadshow AI batch 3 — attendance 87%, feedback bagus. Rekap menyusul.' },
    { who: 'BS', when: 'Yesterday', txt: 'Nice. Slide rekapnya sekalian masuk steering deck ya.' },
  ],
  gln: [{ who: 'SR', when: 'Mon', txt: 'UAT scenario pack sudah final. Defect triage tiap jam 4 sore mulai Kamis.' }],
  dmSR: [
    { who: 'SR', when: '08:55', txt: 'Pak Budi, jadi ikut meeting dinas Kamis?' },
    { who: 'BS', when: '08:57', txt: 'Ikut. Siapkan dokumen ANDALALIN terakhir ya.' },
  ],
  dmDP: [{ who: 'DP', when: 'Tue', txt: 'Rigging vendor quote sudah masuk, 2 opsi.' }],
};

export const workload: Record<string, number[]> = {
  DP: [32, 36, 40, 38, 44, 52, 40, 30], BS: [38, 42, 36, 40, 34, 30, 28, 24], SR: [40, 44, 46, 38, 32, 28, 24, 20],
  AW: [36, 30, 24, 20, 18, 16, 12, 10], RH: [20, 24, 28, 36, 44, 40, 36, 30], MK: [30, 32, 34, 30, 28, 24, 20, 18],
  AP: [36, 38, 42, 46, 38, 32, 28, 22], FN: [32, 34, 36, 38, 40, 36, 30, 26],
};

// The signed-in user in the prototype
export const CURRENT_USER = { id: 'BS', ...members.BS };
