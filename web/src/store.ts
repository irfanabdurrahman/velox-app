import { create } from 'zustand';
import { api, setToken, getToken, setAuthLostHandler } from './api';
import { setEpoch } from './lib/dates';
import type {
  Member, Workspace, Category, Project, Task, Notif, ChatChannel, ChatMsg, User, Screen, View, Zoom, Theme,
  Section, CustomField, StatusUpdatePost,
} from './types';

let nid = 100;
export const newId = (p = 'n') => `${p}${++nid}`;

// temp→server id aliasing: optimistic rows get a temp id until the server-minted
// id arrives; late mutations against the temp id are transparently redirected.
let tmpSeq = 0;
const idAlias: Record<string, string> = {};
export const aliasOf = (id: string) => idAlias[id] || id;
const writeErr = (prefix: string, e: any) => {
  const m = String(e?.message || '');
  if (/403|role|member/i.test(m)) return `${prefix} — you don't have permission in this workspace`;
  return `${prefix} — ${m || 'server rejected the change'}`;
};

export type Toast = { id: number; txt: string; kind: string };

export interface VState {
  // ---- session/data ----
  ready: boolean;
  authed: boolean;
  user: User | null;
  members: Record<string, Member>;
  memberships: { userId: string; ws: string; role: string }[];
  myRoles: Record<string, string>;
  workspaces: Workspace[];
  categories: Category[];
  projects: Project[];
  templates: Project[]; // saved project templates (isTemplate)
  tasks: Task[];
  inbox: Notif[];
  chatChannels: ChatChannel[];
  chatMsgs: Record<string, ChatMsg[]>;
  workload: Record<string, number[]>;
  workloadWeeks: string[];
  sections: Section[];
  customFields: CustomField[];
  statusUpdates: StatusUpdatePost[];
  online: Record<string, string[]>; // workspaceId -> online userIds

  // detail caches
  comments: Record<string, any[]>;
  files: Record<string, any[]>;
  activity: Record<string, any[]>;

  // ---- appearance ----
  theme: Theme;
  accent: string;
  density: 'comf' | 'comp';

  // ---- navigation ----
  sb: boolean;
  ws: string;
  screen: Screen;
  view: View;
  projectId: string;
  openCats: Record<string, boolean>;

  // ---- gantt ----
  zoom: Zoom;
  baselineOn: boolean;
  criticalOn: boolean;
  collapsed: Record<string, boolean>;
  selId: string | null;
  hovId: string | null;
  drag: any;
  pend: any;
  pp: any;
  ppRemOn: boolean;
  parentPref: string;
  depDraw: any;
  editId: string | null;
  editVal: string;
  cellMenu: any;
  cmCal: { y: number; m: number };
  extraCol: boolean;
  colMenu: boolean;
  addDraft: string;
  statusFilter: Record<string, number> | null;
  filterOpen: boolean;
  viewsOpen: boolean;
  shareOpen: boolean;
  projMenuOpen: boolean;
  asBusy: boolean;
  autoDone: boolean;
  present: boolean;
  bdrag: any;
  cdrag: any;
  wldrag: any;

  // ---- slide-over ----
  soId: string | null;
  soTab: string;
  soSubDraft: string;
  soComDraft: string;
  soPolishBusy: boolean;
  descDraft: Record<string, string>;

  // ---- overlays ----
  palette: boolean;
  palQ: string;
  palIdx: number;
  quickAdd: boolean;
  qaText: string;
  qaPreview: any;
  notifOpen: boolean;
  avMenu: boolean;
  wsMenu: boolean;
  wsInvOn: boolean;
  wsJoinOpen: boolean;
  wsJoinCode: string;

  // ---- AI ----
  aiPanel: boolean;
  aiInput: string;
  aiBusy: boolean;
  aiMsgs: any[];
  pInput: string;
  pMsgs: any[];
  pBusy: boolean;
  aiApplied: boolean;
  aiEnabled: boolean;

  // ---- other screens ----
  inboxTab: string;
  chatChan: string;
  chatInput: string;
  dash: { lvl: number; filter: string | null; pid: string | null; cat: string; owner: string };
  listSel: Record<string, boolean>;
  calMode: string;
  calM: number;
  setTab: string;
  adminView: string;
  onb: any;
  toasts: Toast[];

  // ---- actions ----
  set: (patch: Partial<VState> | ((s: VState) => Partial<VState>)) => void;
  bootstrap: () => Promise<void>;
  loginWith: (token: string, user: User) => Promise<void>;
  signOut: () => void;
  go: (screen: Screen) => void;
  setView: (v: View) => void;
  setZoom: (z: Zoom) => void;
  cycleTheme: () => void;
  pushToast: (txt: string, kind?: string) => void;
  openTask: (id: string) => void;
  loadDetail: (id: string) => void;
  addTask: (name: string, pid?: string, par?: string | null, due?: number | null, patch?: Partial<Task>) => string;
  updateTask: (id: string, patch: Partial<Task>, toast?: string) => void;
  deleteTask: (id: string) => void;
  createProject: (p: Partial<Project>) => Promise<Project>;
  deleteProject: (pid: string) => Promise<void>;
  patchProjectMeta: (pid: string, patch: any, toast?: string) => Promise<void>;
  markAllRead: () => void;
  markRead: (id: string) => void;
  autoSchedule: () => void;
  sendChat: (chan: string, txt: string, ref?: string | null) => void;
  applyLive: (msg: { type: string; payload: any }) => void;

  // selectors
  task: (id: string) => Task | undefined;
  proj: (id: string) => Project | undefined;
  kids: (id: string) => Task[];
  desc: (id: string) => Task[];
  parProg: (id: string) => number;
}

export const useStore = create<VState>((set, get) => ({
  ready: false,
  authed: false,
  user: null,
  members: {},
  memberships: [],
  myRoles: {},
  workspaces: [],
  categories: [],
  projects: [],
  templates: [],
  tasks: [],
  inbox: [],
  chatChannels: [],
  chatMsgs: {},
  workload: {},
  workloadWeeks: [],
  sections: [],
  customFields: [],
  statusUpdates: [],
  online: {},
  comments: {},
  files: {},
  activity: {},

  theme: (localStorage.getItem('velox-theme') as Theme) || 'light',
  accent: localStorage.getItem('velox-accent') || 'indigo',
  density: (localStorage.getItem('velox-density') as 'comf' | 'comp') || 'comf',

  sb: false,
  ws: 'dx',
  screen: 'project',
  view: 'gantt',
  projectId: 'karawang',
  openCats: { dt: true, sf: true, infra: true, kaizen: true, it: true },

  zoom: 'day',
  baselineOn: false,
  criticalOn: true,
  collapsed: {},
  selId: null,
  hovId: null,
  drag: null,
  pend: null,
  pp: null,
  ppRemOn: false,
  parentPref: 'ask',
  depDraw: null,
  editId: null,
  editVal: '',
  cellMenu: null,
  cmCal: { y: 2026, m: 6 },
  extraCol: false,
  colMenu: false,
  addDraft: '',
  statusFilter: null,
  filterOpen: false,
  viewsOpen: false,
  shareOpen: false,
  projMenuOpen: false,
  asBusy: false,
  autoDone: false,
  present: false,
  bdrag: null,
  cdrag: null,
  wldrag: null,

  soId: null,
  soTab: 'com',
  soSubDraft: '',
  soComDraft: '',
  soPolishBusy: false,
  descDraft: {},

  palette: false,
  palQ: '',
  palIdx: 0,
  quickAdd: false,
  qaText: '',
  qaPreview: null,
  notifOpen: false,
  avMenu: false,
  wsMenu: false,
  wsInvOn: true,
  wsJoinOpen: false,
  wsJoinCode: '',

  aiPanel: false,
  aiInput: '',
  aiBusy: false,
  aiMsgs: [
    { k: 'user', txt: 'Which projects are at risk of delay?' },
    { k: 'risk' },
  ],
  pInput: '',
  pMsgs: [],
  pBusy: false,
  aiApplied: false,
  aiEnabled: false,

  inboxTab: 'all',
  chatChan: 'krw',
  chatInput: '',
  dash: { lvl: 0, filter: null, pid: null, cat: 'all', owner: 'all' },
  listSel: {},
  calMode: 'month',
  calM: 6,
  setTab: 'integrations',
  adminView: 'admin',
  onb: null,
  toasts: [],

  set: (patch) => set(patch as any),

  bootstrap: async () => {
    // No access token yet — try to resume a session from the refresh cookie.
    if (!getToken()) {
      const resumed = await api.refresh();
      if (!resumed) {
        set({ ready: true, authed: false });
        return;
      }
    }
    try {
      const b = await api.bootstrap();
      setEpoch(b.meta.EP, b.meta.TODAY);
      // Reconcile navigation state with what this user can actually access —
      // a new user has none of the seeded defaults (dx/karawang).
      const cur = get();
      const wsOk = b.workspaces.some((w: Workspace) => w.id === cur.ws);
      const ws = wsOk ? cur.ws : (b.workspaces[0]?.id ?? cur.ws);
      const wsProjects = b.projects.filter((p: Project) => p.ws === ws);
      const projOk = wsProjects.some((p: Project) => p.id === cur.projectId);
      const projectId = projOk ? cur.projectId : (wsProjects[0]?.id ?? '');
      const screen = cur.screen === 'project' && !projectId ? 'home' : cur.screen;
      const chanOk = b.chatChannels.some((c: ChatChannel) => c.id === cur.chatChan);
      set({
        ready: true,
        authed: true,
        user: b.user,
        members: b.members,
        memberships: b.memberships ?? [],
        myRoles: b.myRoles ?? {},
        workspaces: b.workspaces,
        categories: b.categories,
        projects: b.projects,
        templates: b.templates ?? [],
        tasks: b.tasks,
        inbox: b.inbox,
        chatChannels: b.chatChannels,
        chatMsgs: b.chatMsgs,
        workload: b.workload,
        workloadWeeks: b.workloadWeeks ?? [],
        sections: b.sections ?? [],
        customFields: b.customFields ?? [],
        statusUpdates: b.statusUpdates ?? [],
        aiEnabled: !!b.aiEnabled,
        ws, projectId, screen,
        chatChan: chanOk ? cur.chatChan : (b.chatChannels[0]?.id ?? ''),
      });
    } catch (e: any) {
      // Only treat auth failures as a lost session; on network/5xx keep the
      // token so a reload can recover, but surface the login screen.
      const msg = String(e?.message || e);
      if (/401|403|invalid|unauthenticated/i.test(msg)) setToken(null);
      set({ ready: true, authed: false });
    }
  },

  loginWith: async (token, user) => {
    setToken(token);
    set({ user });
    // bootstrap() flips `authed` true only once data has hydrated, so the shell
    // never renders against empty workspaces/members.
    await get().bootstrap();
  },

  signOut: () => {
    api.logout();
    setToken(null);
    set({ authed: false, user: null, ready: true });
  },

  go: (screen) => set({ screen, avMenu: false, wsMenu: false, notifOpen: false }),
  setView: (v) => set({ screen: 'project', view: v }),
  setZoom: (z) => set({ zoom: z }),

  cycleTheme: () => {
    const order: Theme[] = ['light', 'dark', 'system'];
    const cur = get().theme;
    const next = order[(order.indexOf(cur) + 1) % order.length];
    localStorage.setItem('velox-theme', next);
    set({ theme: next });
  },

  pushToast: (txt, kind = 'ok') => {
    const id = ++nid;
    set((s) => ({ toasts: [...s.toasts, { id, txt, kind }] }));
    setTimeout(() => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })), 3600);
  },

  openTask: (id) => {
    set({ soId: id, soTab: 'com', selId: id });
    get().loadDetail(id);
  },

  loadDetail: async (id) => {
    api.taskActivity(id).then((a) => set((s) => ({ activity: { ...s.activity, [id]: a } }))).catch(() => {});
    if (get().comments[id]) return;
    try {
      const d = await api.taskDetail(id);
      set((s) => ({ comments: { ...s.comments, [id]: d.comments }, files: { ...s.files, [id]: d.files } }));
    } catch { /* ignore */ }
  },

  addTask: (name, pid, par = null, due = null, patch) => {
    const s = get();
    const tempId = `tmp_${++tmpSeq}_${Date.now().toString(36)}`;
    const t: Task = {
      id: tempId, pid: pid || s.projectId, par: par ? aliasOf(par) : par, name, a: null, pr: 'med', pg: 0, st: 'mut',
      s: null, e: null, ms: false, crit: false, lbl: [], deps: [], ...(patch || {}),
    };
    // "due" means the task is DUE that day
    if (due != null && t.s == null) { t.s = due; t.e = due; }
    set((st) => ({ tasks: [...st.tasks, t] }));
    // The server mints the real id; reconcile the optimistic row + any references.
    const { id: _tmp, ...payload } = t;
    api.createTask(payload as any)
      .then((created: Task) => {
        idAlias[tempId] = created.id;
        set((st) => ({
          tasks: st.tasks.map((x) => {
            let y = x.id === tempId ? { ...x, id: created.id } : x;
            if (y.par === tempId) y = { ...y, par: created.id };
            if (y.deps.some((d) => d.t === tempId)) y = { ...y, deps: y.deps.map((d) => (d.t === tempId ? { ...d, t: created.id } : d)) };
            return y;
          }),
          selId: st.selId === tempId ? created.id : st.selId,
          soId: st.soId === tempId ? created.id : st.soId,
          editId: st.editId === tempId ? created.id : st.editId,
        }));
      })
      .catch((e) => {
        set((st) => ({ tasks: st.tasks.filter((x) => x.id !== tempId), selId: st.selId === tempId ? null : st.selId, editId: st.editId === tempId ? null : st.editId }));
        get().pushToast(writeErr('Task not saved', e), 'bad');
      });
    return tempId;
  },

  updateTask: (id, patch, toast) => {
    const real = aliasOf(id);
    const before = get().tasks.find((t) => t.id === real);
    set((s) => ({ tasks: s.tasks.map((t) => (t.id === real ? { ...t, ...patch } : t)) }));
    api.updateTask(real, patch).catch((e) => {
      if (before) set((s) => ({ tasks: s.tasks.map((t) => (t.id === real ? before : t)) }));
      get().pushToast(writeErr('Change not saved', e), 'bad');
    });
    if (toast) get().pushToast(toast);
  },

  deleteTask: (id) => {
    const real = aliasOf(id);
    const ids = new Set([real]);
    get().desc(real).forEach((k) => ids.add(k.id));
    const snapshot = get().tasks;
    set((s) => ({ tasks: s.tasks.filter((t) => !ids.has(t.id)), selId: null, soId: s.soId === real ? null : s.soId }));
    api.deleteTask(real)
      .then(() => get().pushToast('Task deleted'))
      .catch((e) => {
        set({ tasks: snapshot });
        get().pushToast(writeErr('Delete failed', e), 'bad');
      });
  },

  createProject: async (p) => {
    const created = await api.createProject(p);
    set((s) => ({ projects: [...s.projects, created] }));
    return created;
  },

  // Permanently delete a project and scrub all of its state locally.
  deleteProject: async (pid) => {
    await api.deleteProject(pid);
    const s = get();
    const remaining = s.projects.filter((p) => p.id !== pid);
    const patch: Partial<VState> = {
      projects: remaining,
      tasks: s.tasks.filter((t) => t.pid !== pid),
      sections: s.sections.filter((x) => x.pid !== pid),
      customFields: s.customFields.filter((x) => x.pid !== pid),
      statusUpdates: s.statusUpdates.filter((x) => x.pid !== pid),
      projMenuOpen: false,
    };
    if (s.projectId === pid) {
      const next = remaining.find((p) => p.ws === s.ws);
      patch.projectId = next?.id ?? '';
      if (!next && s.screen === 'project') patch.screen = 'home';
    }
    set(patch);
    get().pushToast('Project moved to Trash — restore it within 30 days');
  },

  // Patch project fields (rename/color/archive/…) and sync local state.
  patchProjectMeta: async (pid, patch, toast) => {
    const upd = await api.patchProject(pid, patch);
    if (patch.archived) {
      const s = get();
      const remaining = s.projects.filter((p) => p.id !== pid);
      const st: Partial<VState> = { projects: remaining };
      if (s.projectId === pid) {
        const next = remaining.find((p) => p.ws === s.ws);
        st.projectId = next?.id ?? '';
        if (!next && s.screen === 'project') st.screen = 'home';
      }
      set(st);
    } else {
      set((s) => ({ projects: s.projects.map((p) => (p.id === pid ? { ...p, ...upd, shareToken: p.shareToken } : p)) }));
    }
    if (toast) get().pushToast(toast);
  },

  markAllRead: () => {
    set((s) => ({ inbox: s.inbox.map((n) => ({ ...n, unread: false })) }));
    api.markAllRead().catch(() => {});
  },
  markRead: (id) => {
    set((s) => ({ inbox: s.inbox.map((n) => (n.id === id ? { ...n, unread: false } : n)) }));
    api.markRead(id, false).catch(() => {});
  },

  // Real auto-schedule: within the open project, push every task whose start
  // violates a finish-to-start dependency to (dep.end + 1), propagating until
  // stable. The original dates are saved as the baseline.
  autoSchedule: () => {
    const st0 = get();
    if (st0.asBusy) return;
    set({ asBusy: true });
    setTimeout(() => {
      const s = get();
      const proj = s.tasks.filter((t) => t.pid === s.projectId && t.s != null && t.e != null);
      const byId = new Map(proj.map((t) => [t.id, { ...t }]));
      const moved = new Set<string>();
      for (let pass = 0; pass < 20; pass++) {
        let changed = false;
        for (const t of byId.values()) {
          if (!t.deps.length) continue;
          const minStart = Math.max(...t.deps.map((d) => { const dep = byId.get(d.t); return dep && dep.e != null ? dep.e + 1 : -Infinity; }));
          if (Number.isFinite(minStart) && (t.s as number) < minStart) {
            const dur = (t.e as number) - (t.s as number);
            if (!moved.has(t.id)) { t.bs = t.s; t.be = t.e; }
            t.s = minStart; t.e = minStart + dur;
            moved.add(t.id); changed = true;
          }
        }
        if (!changed) break;
      }
      if (!moved.size) {
        set({ asBusy: false, autoDone: true });
        get().pushToast('Auto-schedule: no dependency conflicts — schedule already consistent');
        return;
      }
      set((x) => ({
        asBusy: false, autoDone: true, baselineOn: true,
        tasks: x.tasks.map((t) => byId.has(t.id) && moved.has(t.id) ? { ...t, ...byId.get(t.id)! } : t),
      }));
      moved.forEach((id) => {
        const t = byId.get(id)!;
        api.updateTask(id, { s: t.s, e: t.e, bs: t.bs ?? undefined, be: t.be ?? undefined }).catch(() => {
          get().pushToast('Auto-schedule: some changes failed to save', 'bad');
        });
      });
      get().pushToast(`Auto-schedule: ${moved.size} task${moved.size > 1 ? 's' : ''} moved to satisfy dependencies — baseline saved`);
    }, 700);
  },

  sendChat: (chan, txt, ref = null) => {
    const msg: ChatMsg = { who: get().user?.id || '', when: 'Now', txt, ref: ref ? aliasOf(ref) : ref };
    set((s) => ({ chatMsgs: { ...s.chatMsgs, [chan]: [...(s.chatMsgs[chan] || []), msg] } }));
    api.sendChat(chan, msg).catch((e) => {
      set((s) => ({ chatMsgs: { ...s.chatMsgs, [chan]: (s.chatMsgs[chan] || []).filter((m) => m !== msg) } }));
      get().pushToast(writeErr('Message not sent', e), 'bad');
    });
  },

  // Apply a real-time event pushed over the WebSocket from another user.
  applyLive: (msg) => {
    const s = get();
    const p = msg.payload || {};
    switch (msg.type) {
      case 'presence':
        if (p.workspaceId) set({ online: { ...s.online, [p.workspaceId]: p.online || [] } });
        break;
      case 'task.created':
      case 'task.updated':
      case 'status.changed': {
        const t = p.task;
        if (!t) break;
        // ignore echoes of our own in-flight temp rows; reconcile by id
        const exists = s.tasks.some((x) => x.id === t.id);
        set({ tasks: exists ? s.tasks.map((x) => (x.id === t.id ? { ...x, ...t } : x)) : [...s.tasks, t] });
        break;
      }
      case 'task.deleted': {
        const ids = new Set<string>(p.ids || (p.taskId ? [p.taskId] : []));
        if (ids.size) set({ tasks: s.tasks.filter((x) => !ids.has(x.id)) });
        break;
      }
      case 'project.deleted': {
        if (!p.projectId) break;
        const remaining = s.projects.filter((x) => x.id !== p.projectId);
        const patch: Partial<VState> = {
          projects: remaining,
          tasks: s.tasks.filter((x) => x.pid !== p.projectId),
          sections: s.sections.filter((x) => x.pid !== p.projectId),
        };
        if (s.projectId === p.projectId) {
          const next = remaining.find((x) => x.ws === s.ws);
          patch.projectId = next?.id ?? '';
          if (!next && s.screen === 'project') patch.screen = 'home';
        }
        set(patch);
        break;
      }
      case 'notification':
        // a new in-app notification for us — surface a subtle toast; the full
        // item hydrates on next bootstrap/navigation.
        if (p.text) get().pushToast(p.text, 'ai');
        break;
    }
  },

  task: (id) => get().tasks.find((t) => t.id === id),
  proj: (id) => get().projects.find((p) => p.id === id),
  kids: (id) => get().tasks.filter((t) => t.par === id),
  desc: (id) => {
    const out: Task[] = [];
    const walk = (x: string) => get().kids(x).forEach((k) => { out.push(k); walk(k.id); });
    walk(id);
    return out;
  },
  parProg: (id) => {
    const ks = get().desc(id).filter((k) => !k.ms);
    if (!ks.length) return 0;
    return Math.round(ks.reduce((a, k) => a + (k.pg || 0), 0) / ks.length);
  },
}));

// When a silent refresh fails mid-session, drop back to the login screen.
setAuthLostHandler(() => {
  setToken(null);
  useStore.setState({ authed: false, user: null, ready: true });
});

// Clear per-project UI state (multi-select, selection) when switching projects
// so bulk actions can never touch invisible rows from another project.
let _lastProject = '';
useStore.subscribe((s) => {
  if (s.projectId !== _lastProject) {
    _lastProject = s.projectId;
    if (Object.keys(s.listSel).length || s.selId) useStore.setState({ listSel: {}, selId: null });
  }
});

// persist appearance prefs (only when they actually change)
let _prefs = '';
useStore.subscribe((s) => {
  const key = `${s.theme}|${s.accent}|${s.density}`;
  if (key === _prefs) return;
  _prefs = key;
  localStorage.setItem('velox-theme', s.theme);
  localStorage.setItem('velox-accent', s.accent);
  localStorage.setItem('velox-density', s.density);
});
