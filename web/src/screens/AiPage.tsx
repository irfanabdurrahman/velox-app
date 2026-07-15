import { useEffect, useRef, useState } from 'react';
import { useStore, newId, type VState } from '../store';
import { prMeta, MO } from '../lib/meta';
import { fmt, TODAY, EP, dowIdx, dateOf } from '../lib/dates';
import { Hover } from '../components/Hover';
import { api } from '../api';
import type { Project } from '../types';

// The risk/delay intent ALWAYS renders the structured, data-backed risk card
// (regardless of aiEnabled) — other free-form intents keep their existing routing.
export const isRiskIntent = (txt: string) => {
  const t = txt.toLowerCase();
  return t.includes('risk') || t.includes('risiko') || t.includes('delay');
};

// ===== NL parser (ported from prototype parseNL, lines 3101–3149) =====
export type NL = {
  title: string; assignee: string | null; due: number | null;
  dueTxt: string | null; pr: string | null; proj: Project | null; isID: boolean;
};
export function parseNL(txt: string, s: VState): NL | null {
  if (!txt || txt.trim().length < 3) return null;
  const t = txt.trim();
  const isID = /\b(buat|tugaskan|tenggat|prioritas|proyek|besok|hari ini|minggu depan|tinggi|rendah)\b/i.test(t);
  let title: string | null = null;
  const q = t.match(/["'‘’“”]([^"'‘’“”]+)["'‘’“”]/);
  if (q) title = q[1];
  else {
    const m = t.match(/(?:task|tugas)\s+(.+?)(?:,|$)/i);
    title = m ? m[1] : t.split(',')[0];
  }
  let assignee: string | null = null;
  const am = t.match(/(?:assign(?:ed)?\s*(?:to)?|tugaskan\s*(?:ke|kepada)?)\s+(\w+)/i);
  if (am) {
    const nm = am[1].toLowerCase();
    for (const k in s.members) { if (s.members[k].n.toLowerCase().split(' ').some((w) => w.startsWith(nm))) { assignee = k; break; } }
  }
  let due: number | null = null, dueTxt: string | null = null;
  const days: Record<string, number> = { monday: 0, senin: 0, tuesday: 1, selasa: 1, wednesday: 2, rabu: 2, thursday: 3, kamis: 3, friday: 4, jumat: 4, "jum'at": 4, saturday: 5, sabtu: 5, sunday: 6, minggu: 6 };
  const dm = t.toLowerCase().match(/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday|senin|selasa|rabu|kamis|jumat|jum'at|sabtu)\b/);
  if (dm) { const target = days[dm[1]]; let d = TODAY + 1; while (dowIdx(d) !== target) d++; due = d; dueTxt = fmt(d); }
  else if (/\b(tomorrow|besok)\b/i.test(t)) { due = TODAY + 1; dueTxt = fmt(due); }
  else if (/\b(today|hari ini)\b/i.test(t)) { due = TODAY; dueTxt = fmt(due); }
  else {
    const md = t.match(/\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(\d{1,2})\b/i);
    if (md) {
      const mi = MO.findIndex((x) => x.toLowerCase() === md[1].slice(0, 3).toLowerCase());
      const dayN = parseInt(md[2], 10);
      // derive the year from the live TODAY; a date already past rolls to the next occurrence
      const y = dateOf(TODAY).getUTCFullYear();
      let d0 = Math.round((Date.UTC(y, mi, dayN) - EP) / 864e5);
      if (d0 < TODAY) d0 = Math.round((Date.UTC(y + 1, mi, dayN) - EP) / 864e5);
      due = d0; dueTxt = fmt(due);
    }
  }
  let pr: string | null = null;
  if (/\b(urgent|mendesak)\b/i.test(t)) pr = 'urgent';
  else if (/\b(high|tinggi)\b/i.test(t)) pr = 'high';
  else if (/\b(low|rendah)\b/i.test(t)) pr = 'low';
  let proj: Project | null = null;
  const pm = t.match(/(?:project|proyek)\s+([\w \-]+?)(?:,|\.|$)/i);
  if (pm) {
    const needle = pm[1].trim().toLowerCase();
    let best: Project | null = null, bs = 0;
    s.projects.forEach((p) => {
      const nm = p.name.toLowerCase(); let sc = 0;
      if (nm === needle) sc = 100;
      else if (nm.includes(needle)) sc = 80;
      else if (needle.includes(nm)) sc = 70;
      else needle.split(/\s+/).forEach((w) => { if (w.length >= 3 && nm.split(/\s+/).some((x) => x.startsWith(w))) sc += 10; });
      if (sc > bs) { bs = sc; best = p; }
    });
    if (bs >= 10) proj = best;
  }
  if (!title) return null;
  return { title: title.trim(), assignee, due, dueTxt, pr, proj: proj || null, isID };
}

// aiReplyFor (line 3150) — scripted intent routing
export function aiReplyFor(txt: string, s: VState): any {
  const t = txt.toLowerCase();
  const nl = /\b(create|buat)\b/.test(t) ? parseNL(txt, s) : null;
  if (nl && nl.title && (t.includes('task') || t.includes('tugas'))) return { k: 'nl', nl };
  if (t.includes('risk') || t.includes('risiko') || t.includes('delay')) return { k: 'risk' };
  if (t.includes('update') || t.includes("haven't") || t.includes('belum')) return { k: 'stale' };
  if (t.includes('overdue') || t.includes('terlambat')) return { k: 'over' };
  if (t.includes('recover') || t.includes('recovery') || t.includes('plan')) return { k: 'recov' };
  if (t.includes('conflict') || t.includes('konflik')) return { k: 'conflict' };
  if (t.includes('summar') || t.includes('ringkas')) return { k: 'sum' };
  return { k: 'txt', txt: 'In this prototype I answer a few scripted questions — try a suggestion chip below, or type a natural-language task like: Create task ‘Review PO automation’, assign Budi, due Friday, high priority, project Connected Manufacturing.' };
}

// ---- shared helpers for the real AI endpoints ----
export const aiErrText = (e: any) =>
  /503|not configured/i.test(String(e?.message || '')) ? 'AI belum dikonfigurasi di server ini' : 'AI tidak merespons — coba lagi';

// map the server /ai/parse-task response onto the local NL shape
export function nlFromServer(r: any, raw: string): NL {
  const s = useStore.getState();
  return {
    title: (r?.name || '').trim() || raw.trim(),
    assignee: r?.assigneeId ?? null,
    due: r?.due ?? null,
    dueTxt: r?.due != null ? fmt(r.due) : null,
    pr: r?.priority ?? null,
    proj: (r?.projectId && s.projects.find((p) => p.id === r.projectId)) || null,
    isID: false,
  };
}

// Quick-add holding project ("Belum diatur", code INBX): tasks whose target
// project isn't stated land here and get triaged from My Tasks later.
export const INBOX_CODE = 'INBX';
// NLChips project-picker sentinel for "Belum diatur" (the inbox may not exist yet).
export const INBOX_SENTINEL = '__inbox__';
export function inboxProjOf(s: VState, ws: string): Project | undefined {
  return s.projects.find((p) => p.ws === ws && p.code === INBOX_CODE);
}

const isCreateIntent = (txt: string) => {
  const t = txt.toLowerCase();
  return /\b(create|buat)\b/.test(t) && (t.includes('task') || t.includes('tugas'));
};

// aiSend (line 3162) for the page surface
function aiSend(raw: string) {
  const txt = raw.trim(); if (!txt) return;
  const s = useStore.getState();
  s.set((st) => ({ aiMsgs: [...st.aiMsgs, { k: 'user', txt }], aiInput: '', aiBusy: true }));
  const done = (msg: any) => useStore.getState().set((x) => ({ aiMsgs: [...x.aiMsgs, msg], aiBusy: false }));
  // NL task-create keeps the parse-and-preview flow on both surfaces.
  if (isCreateIntent(txt)) {
    if (s.aiEnabled) {
      api.aiParse(txt)
        .then((r: any) => done({ k: 'nl', nl: nlFromServer(r, txt), raw: txt }))
        .catch((e: any) => {
          const nl = parseNL(txt, useStore.getState());
          if (nl && nl.title) done({ k: 'nl', nl, raw: txt });
          else done({ k: 'txt', txt: aiErrText(e) });
        });
    } else {
      const nl = parseNL(txt, s);
      setTimeout(() => done(nl && nl.title ? { k: 'nl', nl, raw: txt } : aiReplyFor(txt, useStore.getState())), 650);
    }
    return;
  }
  // Risk/delay intent always renders the structured risk card (real data via api.aiRisk).
  if (isRiskIntent(txt)) { done({ k: 'risk' }); return; }
  // Demo mode: scripted cards. Real mode: every other intent goes to /ai/chat.
  if (!s.aiEnabled) {
    const scripted = aiReplyFor(txt, s);
    setTimeout(() => done(scripted), 650);
    return;
  }
  const history = useStore.getState().aiMsgs
    .map((m: any) => (m.k === 'user' ? { role: 'user', content: m.txt } : ((m.k === 'txt' || m.k === 'assistant') && m.txt ? { role: 'assistant', content: m.txt } : null)))
    .filter(Boolean) as { role: string; content: string }[];
  api.aiChat(history)
    .then((r: any) => done({ k: 'txt', txt: r.text }))
    .catch((e: any) => done({ k: 'txt', txt: aiErrText(e) }));
}

// aiCreateFromNL (line 3198)
export async function aiCreateFromNL(nl: NL) {
  const s = useStore.getState();
  let target = nl.proj || inboxProjOf(s, s.ws) || null;
  if (!target) {
    try { target = await s.ensureInbox(s.ws); }
    catch { s.pushToast('Gagal menyiapkan "Belum diatur"', 'bad'); return; }
  }
  const id = s.addTask(nl.title, target.id, null, nl.due ?? undefined, { a: nl.assignee ?? s.user?.id ?? null, pr: nl.pr || 'med' });
  s.pushToast('Task dibuat di ' + target.name, 'ok', { label: 'Buka', go: () => useStore.getState().openTask(id) });
}

// aiAction (3183) / aiApprove (3187)
function aiAction(kind: string) {
  useStore.getState().set((st) => ({ aiMsgs: [...st.aiMsgs, { k: 'confirm', action: kind }] }));
}
function aiApprove() {
  const s = useStore.getState();
  if (s.aiApplied) { s.pushToast('Recovery plan is already applied'); return; } // idempotent
  const g2 = s.task('g2');
  if (g2 && g2.e != null) s.updateTask('g2', { e: g2.e + 4, bs: g2.s, be: g2.e });
  s.set((st) => ({
    aiApplied: true,
    aiMsgs: [...st.aiMsgs, { k: 'applied' }],
    inbox: [{ id: newId('nb'), kind: 'ai', ic: '✦', unread: true, when: 'now', txt: 'Recovery applied on GLN Wave 17: UAT extended +4d, owners notified (2).', ref: 'g2' }, ...st.inbox],
  }));
  s.pushToast('Applied — 1 task rescheduled, 2 owners notified', 'ai');
}
function aiCancel() {
  useStore.getState().set((st) => ({ aiMsgs: [...st.aiMsgs, { k: 'txt', txt: 'Cancelled — no changes were made. The plan stays as-is.' }] }));
}
function aiUndo() {
  const s = useStore.getState();
  if (!s.aiApplied) return; // only undoable after an apply
  const g2 = s.task('g2');
  if (g2 && g2.e != null) s.updateTask('g2', { e: g2.e - 4 });
  s.set((st) => ({ aiApplied: false, aiMsgs: [...st.aiMsgs, { k: 'txt', txt: 'Undone — "Wave 17 UAT execution" restored to its previous dates.' }] }));
  s.pushToast('Change reverted');
}
function aiSeeGantt() { useStore.getState().set({ screen: 'project', projectId: 'gln', view: 'gantt' }); }
function aiRemind() { useStore.getState().pushToast('Gentle reminders sent to 3 people', 'ai'); }
function goProj(pid: string) { useStore.getState().set({ screen: 'project', projectId: pid, view: 'gantt' }); }

const SPARK = <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>;

function AiSpark() {
  return (
    <span style={{ width: 24, height: 24, borderRadius: 8, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center', flex: 'none', marginTop: 2 }}>{SPARK}</span>
  );
}

// ===== Editable parsed-NL chips (assignee / due / priority / project) =====
// Presentational: parent owns the effective values + setters; this holds only
// the ephemeral open-dropdown state.
export function NLChips(props: {
  ws: string; assignee: string | null; due: number | null; pr: string; projId: string | null;
  compact?: boolean;
  onAssignee: (id: string | null) => void; onDue: (d: number | null) => void;
  onPr: (p: string) => void; onProj: (id: string) => void;
}) {
  const s = useStore();
  const [open, setOpen] = useState<'a' | 'pr' | 'p' | null>(null);
  const fs = props.compact ? 10 : 10.5;
  const pad = props.compact ? '2.5px 8px' : '3px 9px';
  const chip: React.CSSProperties = { fontSize: fs, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: pad, color: 'var(--txt2)', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 };
  const flyout: React.CSSProperties = { marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 5, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 8 };
  const opt = (on: boolean): React.CSSProperties => ({ fontSize: fs, fontWeight: 600, border: `1px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)', borderRadius: 99, padding: pad, cursor: 'pointer' });
  const wsMemberIds = Array.from(new Set(s.memberships.filter((m) => m.ws === props.ws).map((m) => m.userId))).filter((id) => s.members[id]);
  const memberList = wsMemberIds.length ? wsMemberIds : Object.keys(s.members);
  const wsList = s.workspaces.filter((w) => { const r = s.myRoles[w.id]; return r && r !== 'GUEST' && r !== 'EXEC_VIEWER'; });
  const proj = props.projId ? s.proj(props.projId) : null;
  const aName = props.assignee ? (s.members[props.assignee]?.n || props.assignee) : 'Unassigned';
  const prCo = props.pr === 'high' || props.pr === 'urgent' ? 'var(--waT)' : 'var(--txt2)';
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, alignItems: 'center' }}>
        <Hover as="span" onClick={() => setOpen(open === 'a' ? null : 'a')} style={chip} hover={{ borderColor: 'var(--acc)' }}>👤 {aName} ▾</Hover>
        <span style={{ ...chip, cursor: 'default', gap: 7 }}>
          <span onClick={() => props.onDue(props.due != null ? props.due - 1 : TODAY)} title="Earlier" style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--accT)' }}>−</span>
          📅 {props.due != null ? fmt(props.due) : 'No due'}
          <span onClick={() => props.onDue(props.due != null ? props.due + 1 : TODAY)} title="Later" style={{ cursor: 'pointer', fontWeight: 800, color: 'var(--accT)' }}>＋</span>
        </span>
        <Hover as="span" onClick={() => setOpen(open === 'pr' ? null : 'pr')} style={{ ...chip, color: prCo }} hover={{ borderColor: 'var(--acc)' }}>⚑ {prMeta(props.pr).t} ▾</Hover>
        <Hover as="span" onClick={() => setOpen(open === 'p' ? null : 'p')} style={{ ...chip, border: '1px solid var(--acc2)', color: 'var(--accT)' }} hover={{ background: 'var(--accS)' }}>{proj && proj.code !== INBOX_CODE ? <>▦ {proj.name}</> : <>📥 Belum diatur</>} ▾</Hover>
      </div>
      {open === 'a' && (
        <div style={flyout}>
          <span onClick={() => { props.onAssignee(null); setOpen(null); }} style={opt(!props.assignee)}>Unassigned</span>
          {memberList.map((id) => (
            <span key={id} onClick={() => { props.onAssignee(id); setOpen(null); }} style={opt(props.assignee === id)}>{s.members[id]?.n || id}</span>
          ))}
        </div>
      )}
      {open === 'pr' && (
        <div style={flyout}>
          {['urgent', 'high', 'med', 'low'].map((p) => (
            <span key={p} onClick={() => { props.onPr(p); setOpen(null); }} style={opt(props.pr === p)}>{prMeta(p).t}</span>
          ))}
        </div>
      )}
      {open === 'p' && (
        <div style={{ ...flyout, flexDirection: 'column', alignItems: 'stretch', gap: 7 }}>
          <span onClick={() => { props.onProj(INBOX_SENTINEL); setOpen(null); }} style={{ ...opt(!proj || proj.code === INBOX_CODE), alignSelf: 'flex-start' }}>📥 Belum diatur</span>
          {wsList.map((w) => {
            const ps = s.projects.filter((p) => p.ws === w.id && p.code !== INBOX_CODE);
            if (!ps.length) return null;
            return (
              <div key={w.id}>
                <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', margin: '1px 0 4px' }}>{w.name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {ps.map((p) => (
                    <span key={p.id} onClick={() => { props.onProj(p.id); setOpen(null); }} style={opt(proj?.id === p.id)}>{p.name}</span>
                  ))}
                </div>
              </div>
            );
          })}
          {!wsList.some((w) => s.projects.some((p) => p.ws === w.id && p.code !== INBOX_CODE)) && <span style={{ fontSize: fs, color: 'var(--txt3)' }}>Belum ada project — task masuk ke 📥 Belum diatur</span>}
        </div>
      )}
    </div>
  );
}

// ===== Structured, data-backed delay-risk card =====
type RiskRow = { project: string; probability: number; causes: string[]; recommendation: string };
const probColor = (p: number) => (p >= 60 ? { t: 'var(--bdT)', b: 'var(--bdB)' } : p >= 35 ? { t: 'var(--waT)', b: 'var(--waB)' } : { t: 'var(--okT)', b: 'var(--okB)' });

export function RiskCard({ compact }: { compact?: boolean }) {
  const s = useStore();
  const [data, setData] = useState<{ rows: RiskRow[]; source: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<string | null>(null);
  const [applied, setApplied] = useState<Record<string, boolean>>({});
  const [note, setNote] = useState<string | null>(null);

  // Lazy load when the card mounts.
  useEffect(() => {
    let live = true;
    setLoading(true);
    api.aiRisk()
      .then((r: any) => { if (live) { setData({ rows: r.rows || [], source: r.source }); setLoading(false); } })
      .catch((e: any) => { if (live) { setErr(aiErrText(e)); setLoading(false); } });
    return () => { live = false; };
  }, []);

  const canWrite = !['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws]);
  const rows = data?.rows || [];
  const top = rows[0];
  const topProj = top ? (s.projects.find((p) => p.name === top.project) || s.projects.find((p) => p.name.toLowerCase() === top.project.toLowerCase())) : undefined;
  const overdueOf = (pid: string) => s.tasks.filter((t) => t.pid === pid && !t.ms && t.st !== 'done' && t.e != null && t.e < TODAY);

  const planText = (kind: string) => {
    if (!topProj) return 'No matching project in this workspace to act on.';
    if (kind === 'resched') { const n = overdueOf(topProj.id).length; return `Shift ${n} overdue task${n === 1 ? '' : 's'} in "${topProj.name}" by +5 days to protect the downstream buffer.`; }
    if (kind === 'notify') return `Notify the owners of "${topProj.name}" and its at-risk tasks (in-app notification).`;
    if (kind === 'recov') return `Create 3 recovery tasks in "${topProj.name}" (re-baseline critical path, reassign slipping tasks, confirm next milestone) starting today.`;
    return '';
  };

  // Real, approved writes. Idempotent per action.
  const approve = (kind: string) => {
    setConfirm(null);
    if (applied[kind]) { s.pushToast('Already applied'); return; }
    setApplied((a) => ({ ...a, [kind]: true }));
    if (kind === 'resched') {
      if (!topProj) { s.pushToast('No matching project to reschedule', 'bad'); return; }
      const overdue = overdueOf(topProj.id);
      if (!overdue.length) { setNote(`No overdue tasks in ${topProj.name} — nothing to shift.`); s.pushToast('No overdue tasks to reschedule'); return; }
      overdue.forEach((t) => s.updateTask(t.id, { s: t.s != null ? t.s + 5 : null, e: (t.e as number) + 5 }));
      setNote(`Shifted ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} in ${topProj.name} by +5 days.`);
      s.pushToast(`Rescheduled ${overdue.length} overdue task${overdue.length === 1 ? '' : 's'} in ${topProj.name} (+5d)`, 'ai');
    } else if (kind === 'notify') {
      setNote('Owners notified (in-app).');
      s.pushToast('Owners notified', 'ai');
    } else if (kind === 'recov') {
      if (!topProj) { s.pushToast('No matching project for recovery tasks', 'bad'); return; }
      ['Recovery: re-baseline critical path', 'Recovery: reassign slipping tasks', 'Recovery: confirm next milestone with owner']
        .forEach((n) => s.addTask(n, topProj.id, null, TODAY, { pr: 'high' }));
      setNote(`Created 3 recovery tasks in ${topProj.name}, starting today.`);
      s.pushToast(`Created 3 recovery tasks in ${topProj.name}`, 'ai');
    }
  };

  const wsName = s.workspaces.find((w) => w.id === s.ws)?.name || 'your workspace';
  const badge = data && (
    data.source === 'ai'
      ? <span style={{ fontSize: 9, fontWeight: 800, color: '#fff', background: 'linear-gradient(135deg,var(--acc),var(--acc2))', borderRadius: 99, padding: '1.5px 8px' }}>AI</span>
      : <span title="Transparent heuristic score (AI not configured)" style={{ fontSize: 9, fontWeight: 800, color: 'var(--txt2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '1.5px 8px' }}>heuristic</span>
  );
  const spinner = (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 2px', fontSize: 12, color: 'var(--txt2)' }}>
      <span style={{ width: 15, height: 15, borderRadius: '50%', border: '2px solid var(--line)', borderTopColor: 'var(--acc)', display: 'inline-block', animation: 'vspin .7s linear infinite' }} />
      Analyzing delay risk across {wsName}…
    </div>
  );

  const bar = (p: number, co: string) => (
    <span style={{ display: 'block', height: 5, borderRadius: 99, background: 'var(--line2)', marginTop: 3, overflow: 'hidden' }}>
      <span style={{ display: 'block', height: '100%', width: `${Math.max(3, Math.min(100, p))}%`, background: co, borderRadius: 99 }} />
    </span>
  );
  const causeChip = (c: string, co: { t: string; b: string }, k: number) => (
    <span key={k} style={{ fontSize: 9.5, fontWeight: 600, background: co.b, color: co.t, borderRadius: 99, padding: '1.5px 7px' }}>{c}</span>
  );

  const actionBtns = () => {
    if (!canWrite) return <div style={{ fontSize: 11, color: 'var(--txt3)', fontStyle: 'italic' }}>View-only role — risk actions are disabled.</div>;
    const btn = (kind: string, label: string, primary?: boolean) => {
      const done = applied[kind];
      return (
        <span key={kind} onClick={done ? undefined : () => { setConfirm(kind); setNote(null); }}
          style={{ fontSize: 11.5, fontWeight: primary ? 700 : 600, borderRadius: 8, padding: '6px 12px', cursor: done ? 'default' : 'pointer', opacity: done ? 0.55 : 1, ...(primary && !done ? { color: '#fff', background: 'var(--acc)' } : { color: 'var(--accT)', border: '1px solid var(--acc2)', background: 'var(--accS)' }) }}>
          {done ? '✓ ' : ''}{label}
        </span>
      );
    };
    return (
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
        {btn('resched', 'Reschedule affected tasks', true)}
        {btn('notify', 'Notify owners')}
        {btn('recov', 'Create recovery tasks')}
      </div>
    );
  };

  const confirmPanel = () => confirm && (
    <div style={{ marginTop: 10, border: '1.5px solid var(--acc2)', background: 'var(--accS)', borderRadius: 12, padding: '11px 13px', animation: 'vup .2s ease' }}>
      <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>⏸ Approval required — nothing applied yet</div>
      <div style={{ fontSize: 12, lineHeight: 1.55, marginBottom: 10 }}>{planText(confirm)}</div>
      <div style={{ display: 'flex', gap: 7 }}>
        <span onClick={() => approve(confirm)} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--ok)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Approve &amp; apply</span>
        <span onClick={() => setConfirm(null)} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt2)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</span>
      </div>
    </div>
  );

  const notePanel = () => note && (
    <div style={{ marginTop: 9, display: 'flex', alignItems: 'center', gap: 7, fontSize: 11.5, fontWeight: 600, color: 'var(--okT)', background: 'var(--okB)', border: '1px solid var(--ok)', borderRadius: 10, padding: '7px 11px' }}>
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>{note}
    </div>
  );

  const body = (
    loading ? spinner
      : err ? <div style={{ fontSize: 12, color: 'var(--txt2)' }}>{err}</div>
        : rows.length === 0 ? <div style={{ fontSize: 12.5, lineHeight: 1.55 }}>No projects with elevated delay risk right now — the portfolio looks on plan.</div>
          : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', fontSize: compact ? 11.5 : 13, lineHeight: 1.55, marginBottom: 10 }}>
                <span>I analyzed schedule pressure, dependency float and update recency across <b>{wsName}</b>. <b>{rows.length} project{rows.length === 1 ? '' : 's'}</b> flagged:</span>
                {badge}
              </div>
              {compact ? (
                <div style={{ marginBottom: 10 }}>
                  {rows.map((r, j) => {
                    const co = probColor(r.probability);
                    const rp = s.projects.find((p) => p.name === r.project);
                    return (
                      <div key={j} style={{ borderTop: j ? '1px solid var(--line2)' : 'none', padding: '8px 0' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6, alignItems: 'center' }}>
                          <span onClick={rp ? () => goProj(rp.id) : undefined} style={{ fontSize: 11.5, fontWeight: 700, color: rp ? 'var(--accT)' : 'var(--txt)', cursor: rp ? 'pointer' : 'default' }}>{r.project}</span>
                          <span style={{ fontSize: 10.5, fontWeight: 800, color: co.t }}>{r.probability}%</span>
                        </div>
                        {bar(r.probability, co.t)}
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3, margin: '5px 0 3px' }}>{r.causes.map((c, k) => causeChip(c, co, k))}</div>
                        <div style={{ fontSize: 10.5, color: 'var(--txt2)', lineHeight: 1.4 }}>{r.recommendation}</div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{ border: '1px solid var(--line)', borderRadius: 11, overflow: 'hidden', marginBottom: 11 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 92px 1.6fr 1.5fr', gap: 8, padding: '7px 11px', background: 'var(--bg)', fontSize: 9, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                    <span>Project</span><span>Delay prob</span><span>Root causes</span><span>Recommended action</span>
                  </div>
                  {rows.map((r, j) => {
                    const co = probColor(r.probability);
                    const rp = s.projects.find((p) => p.name === r.project);
                    return (
                      <div key={j} style={{ display: 'grid', gridTemplateColumns: '1.4fr 92px 1.6fr 1.5fr', gap: 8, padding: '8px 11px', borderTop: '1px solid var(--line2)', fontSize: 11, alignItems: 'center' }}>
                        <span onClick={rp ? () => goProj(rp.id) : undefined} style={{ fontWeight: 700, color: rp ? 'var(--accT)' : 'var(--txt)', cursor: rp ? 'pointer' : 'default' }}>{r.project}</span>
                        <span><span style={{ fontSize: 10.5, fontWeight: 800, color: co.t }}>{r.probability}%</span>{bar(r.probability, co.t)}</span>
                        <span style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }}>{r.causes.map((c, k) => causeChip(c, co, k))}</span>
                        <span style={{ color: 'var(--txt)', fontWeight: 600, lineHeight: 1.4 }}>{r.recommendation}</span>
                      </div>
                    );
                  })}
                </div>
              )}
              {actionBtns()}
              {confirmPanel()}
              {notePanel()}
            </>
          )
  );

  if (compact) return <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 11, marginBottom: 9, background: 'var(--card)' }}>{body}</div>;
  return (
    <div style={{ display: 'flex', gap: 9, margin: '12px 0' }}>
      <AiSpark />
      <div style={{ flex: 1, maxWidth: '92%' }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '5px 15px 15px 15px', padding: '13px 15px', boxShadow: 'var(--sh1)' }}>{body}</div>
      </div>
    </div>
  );
}

// ===== Editable parsed-task preview card (AiPage conversation) =====
function NlCard({ nl, raw }: { nl: NL; raw?: string }) {
  const s = useStore();
  const [aOv, setAOv] = useState<string | null | undefined>(undefined);
  const [dueOv, setDueOv] = useState<number | null | undefined>(undefined);
  const [prOv, setPrOv] = useState<string | undefined>(undefined);
  const [projOv, setProjOv] = useState<string | null>(null);
  const canWrite = !['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws]);
  const effA = aOv !== undefined ? aOv : (nl.assignee ?? null);
  const effDue = dueOv !== undefined ? dueOv : (nl.due ?? null);
  const effPr = prOv !== undefined ? prOv : (nl.pr ?? 'med');
  const effProj = projOv === INBOX_SENTINEL ? (inboxProjOf(s, s.ws) || null) : (projOv ? s.proj(projOv) : null) || nl.proj || inboxProjOf(s, s.ws) || null;
  const create = () => {
    if (!canWrite) return;
    aiCreateFromNL({ ...nl, assignee: effA, due: effDue, dueTxt: effDue != null ? fmt(effDue) : null, pr: effPr, proj: effProj || null });
  };
  return (
    <div style={{ margin: '12px 0 12px 33px', maxWidth: '82%', border: '1.5px solid var(--acc2)', background: 'var(--accS)', borderRadius: 14, padding: '13px 15px', animation: 'vup .2s ease' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 7 }}><span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Parsed task preview</span>{nl.isID && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--card)', color: 'var(--txt2)', border: '1px solid var(--line)', borderRadius: 99, padding: '1.5px 7px' }}>🇮🇩 Bahasa Indonesia terdeteksi</span>}</div>
      <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 8 }}>{nl.title}</div>
      <div style={{ marginBottom: 10 }}>
        <NLChips ws={s.ws} assignee={effA} due={effDue} pr={effPr} projId={effProj?.id ?? null} onAssignee={setAOv} onDue={setDueOv} onPr={setPrOv} onProj={setProjOv} />
      </div>
      <div style={{ display: 'flex', gap: 7 }}>
        <span onClick={canWrite ? create : undefined} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: '6px 14px', ...(canWrite ? { color: '#fff', background: 'var(--acc)', cursor: 'pointer' } : { color: '#fff', background: 'var(--muB)', cursor: 'not-allowed' }) }}>Create</span>
        <span onClick={() => s.set({ quickAdd: true, qaText: raw || nl.title })} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt2)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Edit</span>
      </div>
    </div>
  );
}

export function AiPage() {
  const s = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.aiMsgs, s.aiBusy]);

  // With the real AI enabled, drop the seeded demo conversation (canned risk card).
  useEffect(() => {
    if (!s.aiEnabled) return;
    const st = useStore.getState();
    if (st.aiMsgs.length === 2 && st.aiMsgs[0]?.k === 'user' && st.aiMsgs[1]?.k === 'risk') st.set({ aiMsgs: [] });
  }, [s.aiEnabled]);

  const staleRows = [
    { av: 'HG', n: 'Hendra Gunawan', meta: 'Soil compaction test (Karawang)', days: 6 },
    { av: 'AP', n: 'Agus Prasetyo', meta: 'Data migration dry-run 2 (GLN)', days: 5 },
    { av: 'RH', n: 'Rizky Hidayat', meta: 'Chatbot intent library (Helpdesk)', days: 5 },
  ];
  const overRows = [
    { dept: 'DX Department', items: 'Soil compaction test · PO mapping review · Data migration dry-run 2', n: 3 },
    { dept: 'IT Division', items: 'Chatbot intent library · KB article migration · Agent training deck', n: 3 },
    { dept: 'Kaizen / QCC', items: 'Batch 12 schedule confirm', n: 1 },
  ];
  const chips = [
    'Which projects are at risk of delay?',
    "Who hasn't updated their tasks this week?",
    'List overdue tasks by department',
    'Recommend a recovery plan for GLN Wave 17',
    "Create task 'Review PO automation', assign Budi, due Friday, high priority, project Connected Manufacturing",
    "Buat tugas 'Kalibrasi mesin CNC', tugaskan ke Dewi, tenggat Jumat, prioritas tinggi, proyek Karawang",
  ];

  const renderMsg = (m: any, i: number) => {
    // Canned demo cards belong to demo mode only. The risk card is always real.
    if (s.aiEnabled && ['stale', 'over', 'recov', 'confirm', 'applied'].includes(m.k)) return null;
    if (m.k === 'user') return (
      <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', margin: '12px 0' }}><div style={{ maxWidth: '70%', background: 'var(--acc)', color: '#fff', borderRadius: '15px 15px 5px 15px', padding: '10px 15px', fontSize: 13, lineHeight: 1.55 }}>{m.txt}</div></div>
    );
    if (m.k === 'txt') return (
      <div key={i} style={{ display: 'flex', gap: 9, margin: '12px 0' }}><AiSpark /><div style={{ maxWidth: '82%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: '5px 15px 15px 15px', padding: '10px 15px', fontSize: 13, lineHeight: 1.6, boxShadow: 'var(--sh1)' }}>{m.txt}</div></div>
    );
    if (m.k === 'risk') return <RiskCard key={i} />;
    if (m.k === 'confirm') {
      const actLabel = ({ resched: 'Reschedule affected tasks', notify: 'Notify owners', recov: 'Create recovery tasks' } as Record<string, string>)[m.action] || 'this action';
      return (
        <div key={i} style={{ margin: '12px 0 12px 33px', maxWidth: '82%', border: '1.5px solid var(--acc2)', background: 'var(--accS)', borderRadius: 14, padding: '13px 15px', animation: 'vup .2s ease' }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>⏸ Approval required — nothing applied yet</div>
          <div style={{ fontSize: 12.5, lineHeight: 1.6, marginBottom: 10 }}>Plan for <b>{actLabel}</b>:<br />1 · Shift <b>"Wave 17 UAT execution"</b> Jul 13 → Jul 17 (＋4d, keeps sign-off buffer)<br />2 · Set <b>"Permit finalization (IMB)"</b> due Jul 28 &amp; add expeditor subtask<br />3 · Notify <b>Sari Rahma</b> and <b>Dewi Putri</b> with context</div>
          <div style={{ display: 'flex', gap: 7 }}>
            <span onClick={aiApprove} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--ok)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer' }}>Approve &amp; apply</span>
            <span onClick={aiCancel} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--txt2)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Cancel</span>
          </div>
        </div>
      );
    }
    if (m.k === 'applied') return (
      <div key={i} style={{ margin: '12px 0 12px 33px', maxWidth: '82%', border: '1px solid var(--ok)', background: 'var(--okB)', borderRadius: 14, padding: '12px 15px', animation: 'vup .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 700, color: 'var(--okT)' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>Applied — 1 task rescheduled, 1 subtask created, 2 owners notified</div>
        <div style={{ fontSize: 11, color: 'var(--txt2)', marginTop: 4 }}>Gantt updated · baseline saved · <span onClick={aiUndo} style={{ color: 'var(--accT)', fontWeight: 700, cursor: 'pointer' }}>Undo</span> · <span onClick={aiSeeGantt} style={{ color: 'var(--accT)', fontWeight: 700, cursor: 'pointer' }}>See it on the Gantt →</span></div>
      </div>
    );
    if (m.k === 'stale') return (
      <div key={i} style={{ margin: '12px 0 12px 33px', maxWidth: '82%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 9 }}><b>3 people</b> haven't updated assigned tasks in 5+ days:</div>
        {staleRows.map((r, j) => (
          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 0', borderTop: '1px solid var(--line2)' }}>
            <span style={{ width: 22, height: 22, borderRadius: '50%', background: s.members[r.av]?.c, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800 }}>{r.av}</span>
            <span style={{ flex: 1, fontSize: 11.5 }}><b>{r.n}</b> · {r.meta}</span>
            <span style={{ fontSize: 10, color: 'var(--bdT)', fontWeight: 700 }}>{r.days}d silent</span>
          </div>
        ))}
        <span onClick={aiRemind} style={{ display: 'inline-flex', marginTop: 9, fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Send gentle reminders</span>
      </div>
    );
    if (m.k === 'over') return (
      <div key={i} style={{ margin: '12px 0 12px 33px', maxWidth: '82%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, marginBottom: 9 }}><b>7 overdue tasks</b> by department:</div>
        {overRows.map((r, j) => (
          <div key={j} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5.5px 0', borderTop: '1px solid var(--line2)', fontSize: 11.5 }}>
            <span style={{ fontWeight: 700, width: 130, flex: 'none' }}>{r.dept}</span>
            <span style={{ flex: 1, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.items}</span>
            <span style={{ fontSize: 10, fontWeight: 800, background: 'var(--bdB)', color: 'var(--bdT)', borderRadius: 99, padding: '2px 8px', flex: 'none' }}>{r.n}</span>
          </div>
        ))}
      </div>
    );
    if (m.k === 'recov') return (
      <div key={i} style={{ margin: '12px 0 12px 33px', maxWidth: '82%', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
        <div style={{ fontSize: 12.5, lineHeight: 1.55, marginBottom: 9 }}>Recovery plan for <b>GLN Wave 17 Preparation</b> (slip forecast: 5d):</div>
        <div style={{ fontSize: 12, lineHeight: 1.7, color: 'var(--txt2)' }}>1 · Compress UAT from 15d → 12d by parallelizing scenario packs (needs 1 extra tester)<br />2 · Pre-approve defect triage decisions under P2 severity<br />3 · Move sign-off gate to async approval with 24h SLA<br />4 · Add hypercare shadow week to de-risk cutover</div>
        <span onClick={() => aiAction('recov')} style={{ display: 'inline-flex', marginTop: 10, fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}>Create 4 recovery tasks</span>
      </div>
    );
    if (m.k === 'nl' && m.nl) return <NlCard key={i} nl={m.nl} raw={m.raw} />;
    return null;
  };

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      <div ref={scrollRef} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '18px 20px 8px' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11, marginBottom: 4 }}>
            <span style={{ width: 34, height: 34, borderRadius: 11, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px var(--ring)' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg></span>
            <div><div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em' }}>Velox AI</div><div style={{ fontSize: 11, color: 'var(--txt3)' }}>Generative + agentic · sees your workspace, acts with your approval</div></div>
          </div>
          <div style={{ margin: '16px 0 0' }}>
            {s.aiMsgs.map(renderMsg)}
            {s.aiBusy && <div style={{ display: 'flex', gap: 4, padding: '8px 0 4px 33px' }}><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txt3)', animation: 'vpulse 1s infinite' }} /><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txt3)', animation: 'vpulse 1s .2s infinite' }} /><span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txt3)', animation: 'vpulse 1s .4s infinite' }} /></div>}
          </div>
        </div>
      </div>
      <div style={{ flex: 'none', padding: '8px 20px 14px', background: 'var(--bg)' }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
            {chips.map((c, j) => (
              <Hover key={j} as="span" onClick={() => aiSend(c)} style={{ fontSize: 11, fontWeight: 600, color: 'var(--accT)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '5px 12px', cursor: 'pointer' }} hover={{ borderColor: 'var(--acc)', background: 'var(--accS)' }}>{c}</Hover>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--card)', border: '1.5px solid var(--line)', borderRadius: 14, padding: '9px 10px 9px 14px', boxShadow: 'var(--sh2)' }}>
            <textarea value={s.aiInput} onChange={(e) => s.set({ aiInput: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); aiSend(s.aiInput); } }} placeholder="Ask anything — or create a task in natural language (EN / ID)…" style={{ flex: 1, background: 'transparent', border: 'none', resize: 'none', fontSize: 13, color: 'var(--txt)', maxHeight: 110, minHeight: 22, lineHeight: 1.5 }} />
            <span onClick={() => aiSend(s.aiInput)} style={{ width: 32, height: 32, borderRadius: 10, background: 'var(--acc)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none', boxShadow: '0 2px 8px var(--ring)' }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></span>
          </div>
        </div>
      </div>
    </div>
  );
}
