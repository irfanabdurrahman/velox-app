import { useStore, aliasOf } from '../store';
import { Hover } from './Hover';
import { ACCENT_SWATCH } from '../lib/meta';
import { fmt, TODAY, dowIdx } from '../lib/dates';
import { api, getToken } from '../api';

// ---- scheduling helpers: sequential phases starting TODAY, ~10 working days each ----
const nextWorkday = (d: number) => { let x = d; while (dowIdx(x) >= 5) x++; return x; };
const addWorkdays = (start: number, n: number) => { let d = start, left = n; while (left > 0) { d++; if (dowIdx(d) < 5) left--; } return d; };

type Phase = { ph: string; name?: string; items?: string[]; s?: number; e?: number };

// Lay phases out sequentially from TODAY: phase i spans 10 working days.
function schedulePhases<T extends { items?: string[] }>(phases: (T & { name?: string; ph?: string })[]): (T & { s: number; e: number })[] {
  let cursor = nextWorkday(TODAY);
  return phases.map((p) => {
    const s0 = cursor;
    const e0 = addWorkdays(s0, 9); // 10 working days including the start day
    cursor = nextWorkday(e0 + 1);
    return { ...p, s: s0, e: e0 };
  });
}

// AI work-breakdown proposal — structure is canned, the schedule is real (from TODAY).
function wbsPlan(): Phase[] {
  const base = [
    { name: 'Phase 1 — Discovery', items: ['Stakeholder interviews (Procurement, Finance)', 'Current-state PO flow mapping', 'Success metrics & baseline'] },
    { name: 'Phase 2 — Build', items: ['Email ingestion pipeline', 'PO field extraction model', 'ERP posting integration', 'Exception review UI'] },
    { name: 'Phase 3 — Pilot', items: ['Pilot with 2 suppliers', 'Accuracy tuning ≥ 97%', 'Ops handover runbook'] },
    { name: 'Phase 4 — Rollout', items: ['All-supplier rollout', 'Hypercare & training', 'Benefit tracking dashboard'] },
  ];
  return schedulePhases(base).map((p) => ({ ...p, ph: `${p.name} (${fmt(p.s)} – ${fmt(p.e)})` }));
}

const TPLS = [
  { n: 'Blank project', d: 'Mulai dari nol — tanpa template, tanpa task' },
  { n: 'Factory Relocation Project', d: 'Site prep → pindah mesin → fit-out → ramp-up' },
  { n: 'Software Sprint', d: '2-week sprint with rituals' },
  { n: 'Manufacturing Kaizen / QCC', d: 'A3, countermeasures, yokoten' },
  { n: 'Event', d: 'Run-of-show & vendors' },
  { n: 'OKR Cycle', d: 'Objectives → key results' },
  { n: 'Audit Preparation', d: 'Evidence & findings tracker' },
];

// Phases (and subtasks, where the playbook defines them) created for real per template.
const TPL_PHASES: Record<string, Phase[]> = {
  'Factory Relocation Project': [
    { ph: 'Site preparation & permits (IMB)', items: ['Permit dossier & submission', 'Site survey & soil test', 'Utility rerouting plan'] },
    { ph: 'Machine disassembly & transport', items: ['Rigging vendor contract', 'Line disassembly', 'Transport & customs'] },
    { ph: 'Reassembly & commissioning' },
    { ph: 'IT / facility fit-out & ramp-up' },
  ],
  'Software Sprint': [
    { ph: 'Sprint planning & goal' },
    { ph: 'Build' },
    { ph: 'QA + review gate' },
    { ph: 'Retro & carry-over' },
  ],
  'Manufacturing Kaizen / QCC': [
    { ph: 'Theme & baseline (A3)' },
    { ph: 'Root cause (5-why / fishbone)' },
    { ph: 'Countermeasure trials' },
    { ph: 'Standardize + yokoten' },
  ],
  Event: [
    { ph: 'Venue & budget', items: ['Shortlist venues', 'Budget approval'] },
    { ph: 'Vendor contracts' },
    { ph: 'Run-of-show' },
    { ph: 'Post-event report' },
  ],
  'OKR Cycle': [
    { ph: 'Draft objectives' },
    { ph: 'Align key results' },
    { ph: 'Weekly check-ins' },
    { ph: 'Scoring & reset' },
  ],
  'Audit Preparation': [
    { ph: 'Scope & evidence list' },
    { ph: 'Gap assessment' },
    { ph: 'Remediation tasks' },
    { ph: 'Mock audit + readout' },
  ],
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function Onboarding() {
  const s = useStore();
  const onb = s.onb;
  if (!onb) return null;

  const setOnb = (patch: any) => s.set((st) => ({ onb: st.onb ? { ...st.onb, ...patch } : st.onb }));
  const mode = onb.mode || (onb.tpl ? 'tpl' : null);

  const onbGen = () => { if (onb.busy) return; setOnb({ busy: true }); setTimeout(() => setOnb({ busy: false, wbs: wbsPlan() }), 1200); };

  // Step 1 — actually create the workspace (skipped for new-project-only flow).
  const step1Next = async () => {
    if (onb.wsBusy) return;
    if (onb.newProj || onb.createdWs) { setOnb({ step: 2 }); return; }
    const name = (onb.wsName || '').trim();
    if (!name) { s.pushToast('Enter a workspace name first', 'bad'); return; }
    setOnb({ wsBusy: true });
    try {
      const r = await fetch('/api/workspaces', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getToken()}` },
        body: JSON.stringify({ name }),
      });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}) as any)).error || 'request failed');
      const ws = await r.json(); // {id,name,color,ini,meta}
      s.set((st) => ({
        workspaces: [...st.workspaces, ws],
        ws: ws.id,
        myRoles: { ...st.myRoles, [ws.id]: 'OWNER' },
        onb: st.onb ? { ...st.onb, wsBusy: false, createdWs: ws, step: 2 } : st.onb,
      }));
      s.pushToast('Workspace "' + ws.name + '" created');
    } catch (e: any) {
      setOnb({ wsBusy: false });
      s.pushToast('Workspace not created — ' + (e?.message || 'request failed'), 'bad');
    }
  };

  const addInvite = () => {
    const v = (onb.inv || '').trim();
    if (!v) return;
    if (!EMAIL_RE.test(v)) { s.pushToast('Enter a valid email address', 'bad'); return; }
    if ((onb.invites || []).includes(v)) { setOnb({ inv: '' }); return; }
    setOnb({ invites: [...(onb.invites || []), v], inv: '' });
  };

  // Create phase tasks (and subtasks once the phase's server id exists) for real.
  const seedTasks = (projId: string, phases: Phase[]): number => {
    const st = useStore.getState();
    const scheduled = phases.every((p) => p.s != null && p.e != null) ? (phases as (Phase & { s: number; e: number })[]) : schedulePhases(phases);
    let count = 0;
    scheduled.forEach((w) => {
      const phId = st.addTask(w.name || w.ph, projId, null, undefined, { s: w.s, e: w.e, st: 'mut' });
      count++;
      const items = w.items || [];
      if (!items.length) return;
      count += items.length;
      // wait for the phase's real id — the server rejects unknown parent ids
      const spawn = (realPar: string) => {
        let sub = w.s as number;
        const per = Math.max(1, Math.floor(10 / items.length));
        items.forEach((n, i) => {
          const se = i === items.length - 1 ? (w.e as number) : Math.min(w.e as number, addWorkdays(sub, per - 1));
          useStore.getState().addTask(n, projId, realPar, undefined, { s: sub, e: se, st: 'mut' });
          sub = Math.min(w.e as number, nextWorkday(se + 1));
        });
      };
      const waitReal = (tries: number) => {
        const real = aliasOf(phId);
        if (real !== phId) return spawn(real);
        if (!useStore.getState().task(phId)) return; // phase creation failed — rolled back
        if (tries > 60) return;
        setTimeout(() => waitReal(tries + 1), 150);
      };
      waitReal(0);
    });
    return count;
  };

  const onbFinish = async () => {
    const isAi = mode === 'ai' && !!onb.wbs;
    const isTpl = mode === 'tpl' && !!onb.tpl;
    if (!(isAi || isTpl) || onb.creating) return;
    // user-saved template → server-side duplicate carries tasks/sections/fields
    if (isTpl && typeof onb.tpl === 'string' && onb.tpl.startsWith('saved:')) {
      const tplId = onb.tpl.slice(6);
      const tpl = s.templates.find((p) => p.id === tplId);
      const nm = (tpl?.name || 'New project').replace(/ \(template\)$/, '');
      setOnb({ creating: true });
      try {
        const np = await api.duplicateProject(tplId, nm);
        await s.bootstrap();
        s.set({ onb: null, screen: 'project', projectId: np.id, view: 'gantt' });
        s.pushToast(`"${np.name}" created from your template`);
      } catch (e: any) {
        setOnb({ creating: false });
        s.pushToast('Project not created — ' + (e?.message || 'server rejected the request'), 'bad');
      }
      return;
    }
    const name = isAi ? ((onb.desc || '').trim().slice(0, 48) || 'AI project') : (onb.tpl === 'Blank project' ? 'Untitled project' : onb.tpl);
    const code = (name.replace(/[^A-Za-z ]/g, '').split(/\s+/).filter(Boolean).map((w: string) => w[0]).join('').slice(0, 3) || 'NEW').toUpperCase();
    setOnb({ creating: true });
    try {
      const proj = await s.createProject({
        name, code, cat: onb.cat || undefined, ws: targetWs, owner: s.user?.id || '',
        st: 'mut', prog: 0, due: null, color: ACCENT_SWATCH[s.accent] || '#6366F1',
      } as any);
      const phases: Phase[] = isAi ? onb.wbs : (TPL_PHASES[onb.tpl] || []);
      const n = phases.length ? seedTasks(proj.id, phases) : 0;
      s.set({ onb: null, screen: 'project', projectId: proj.id, view: 'gantt' });
      const msg = isAi
        ? `"${proj.name}" created — ${n} tasks scheduled`
        : (onb.tpl === 'Blank project'
          ? `"${proj.name}" created — add your first task`
          : `"${proj.name}" created from "${onb.tpl}" template — ${n} tasks scheduled`);
      s.pushToast(msg, isAi ? 'ai' : 'ok');
    } catch (e: any) {
      setOnb({ creating: false });
      s.pushToast('Project not created — ' + (e?.message || 'server rejected the request'), 'bad');
    }
  };

  const finReady = (mode === 'ai' && !!onb.wbs) || (mode === 'tpl' && !!onb.tpl);
  const targetWs = onb.createdWs?.id || s.ws;
  const wsCats = s.categories.filter((c) => c.ws === targetWs);
  const inputStyle = { width: '100%', background: 'var(--inputBg)', border: '1.5px solid var(--line)', borderRadius: 11, padding: '11px 13px', fontSize: 14, fontWeight: 600, color: 'var(--txt)', outline: 'none' } as const;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(9,10,14,.5)', backdropFilter: 'blur(3px)', zIndex: 95, display: 'grid', placeItems: 'center', animation: 'vfade .15s ease' }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(680px,94vw)', maxHeight: '88vh', overflowY: 'auto', background: 'var(--panel)', border: '1px solid var(--line)', borderRadius: 20, boxShadow: 'var(--sh3)', padding: '26px 28px', animation: 'vpop .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
          <div style={{ width: 30, height: 30, borderRadius: 9, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center' }}><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l7 8-7 8" /><path d="M13 4l7 8-7 8" /></svg></div>
          <span style={{ fontSize: 16, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-.03em' }}>velox</span>
          <span onClick={() => s.set({ onb: null })} style={{ marginLeft: 'auto', cursor: 'pointer', color: 'var(--txt3)' }}><svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg></span>
        </div>
        <div style={{ display: 'flex', gap: 6, margin: '14px 0 20px' }}>
          <span style={{ flex: 1, height: 4, borderRadius: 99, background: 'var(--acc)' }} />
          <span style={{ flex: 1, height: 4, borderRadius: 99, background: onb.step > 1 ? 'var(--acc)' : 'var(--muB)' }} />
          <span style={{ flex: 1, height: 4, borderRadius: 99, background: onb.step > 2 ? 'var(--acc)' : 'var(--muB)' }} />
        </div>

        {onb.step === 1 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>Create your workspace</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 16 }}>A workspace holds your team's projects, goals, and chat.</div>
            <input value={onb.wsName || ''} onChange={(e) => setOnb({ wsName: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') step1Next(); }} placeholder="e.g. DX Department" disabled={!!onb.createdWs} style={inputStyle} />
            {onb.createdWs && <div style={{ fontSize: 11.5, color: 'var(--okT)', marginTop: 8, fontWeight: 600 }}>✓ Workspace "{onb.createdWs.name}" created</div>}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
              <span onClick={step1Next} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 10, padding: '9px 20px', cursor: 'pointer', opacity: onb.wsBusy ? 0.7 : 1 }}>
                {onb.wsBusy && <svg style={{ animation: 'vspin .7s linear infinite' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>}
                {onb.wsBusy ? 'Creating workspace…' : (onb.createdWs ? 'Continue →' : 'Create workspace →')}
              </span>
            </div>
          </>
        )}

        {onb.step === 2 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>Invite your team</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 16 }}>Type an email and press Enter. You can also do this later.</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, background: 'var(--inputBg)', border: '1.5px solid var(--line)', borderRadius: 11, padding: '9px 11px' }}>
              {(onb.invites || []).map((e0: string, i: number) => (
                <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, background: 'var(--accS)', color: 'var(--accT)', borderRadius: 99, padding: '4px 10px' }}>{e0}<span onClick={() => setOnb({ invites: onb.invites.filter((_: string, j: number) => j !== i) })} style={{ cursor: 'pointer', fontWeight: 800 }}>×</span></span>
              ))}
              <input value={onb.inv || ''} onChange={(e) => setOnb({ inv: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') addInvite(); }} placeholder="sari.r@company.co.id" style={{ flex: 1, minWidth: 150, background: 'transparent', border: 'none', fontSize: 13, color: 'var(--txt)', outline: 'none' }} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 8 }}>Invites are stored for when email sending is configured — no emails are sent yet.</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18 }}><span onClick={() => setOnb({ step: Math.max(1, onb.step - 1) })} style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt2)', cursor: 'pointer', padding: '9px 6px' }}>← Back</span><span onClick={() => setOnb({ step: Math.min(3, onb.step + 1) })} style={{ fontSize: 13, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 10, padding: '9px 20px', cursor: 'pointer' }}>Continue →</span></div>
          </>
        )}

        {onb.step === 3 && (
          <>
            <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 6 }}>Create your first project</div>
            <div style={{ fontSize: 13, color: 'var(--txt2)', marginBottom: 14 }}>Start from a template — or describe it and let Velox AI build the plan.</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              <span onClick={() => setOnb({ mode: 'tpl' })} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 8, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${mode === 'tpl' ? 'var(--acc)' : 'var(--line)'}`, background: mode === 'tpl' ? 'var(--accS)' : 'transparent', color: mode === 'tpl' ? 'var(--accT)' : 'var(--txt2)' }}>From template</span>
              <span onClick={() => setOnb({ mode: 'ai' })} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 8, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${mode === 'ai' ? 'var(--acc)' : 'var(--line)'}`, background: mode === 'ai' ? 'var(--accS)' : 'transparent', color: mode === 'ai' ? 'var(--accT)' : 'var(--txt2)' }}>✦ Describe it — AI builds the plan</span>
            </div>

            {wsCats.length > 0 && (
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt3)', marginBottom: 5 }}>Category (optional)</div>
                <select value={onb.cat || ''} onChange={(e) => setOnb({ cat: e.target.value })} style={{ width: '100%', fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 9, background: 'var(--inputBg)', color: 'var(--txt)' }}>
                  <option value="">(Uncategorized)</option>
                  {wsCats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </div>
            )}

            {mode === 'tpl' && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                {TPLS.map((t) => (
                  <Hover key={t.n} onClick={() => setOnb({ tpl: t.n })} style={{ border: `1.5px solid ${onb.tpl === t.n ? 'var(--acc)' : 'var(--line)'}`, background: onb.tpl === t.n ? 'var(--accS)' : 'transparent', borderRadius: 12, padding: '11px 13px', cursor: 'pointer' }} hover={{ borderColor: 'var(--acc)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{t.n}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{t.d}</div>
                  </Hover>
                ))}
                {s.templates.filter((p) => p.ws === (onb.createdWs?.id || s.ws)).map((p) => (
                  <Hover key={p.id} onClick={() => setOnb({ tpl: 'saved:' + p.id })} style={{ border: `1.5px solid ${onb.tpl === 'saved:' + p.id ? 'var(--acc)' : 'var(--line)'}`, background: onb.tpl === 'saved:' + p.id ? 'var(--accS)' : 'transparent', borderRadius: 12, padding: '11px 13px', cursor: 'pointer' }} hover={{ borderColor: 'var(--acc)' }}>
                    <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                    <div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>Your template · {p.code}</div>
                  </Hover>
                ))}
              </div>
            )}

            {mode === 'ai' && (
              <>
                <textarea value={onb.desc || ''} onChange={(e) => setOnb({ desc: e.target.value })} placeholder="e.g. Rollout PO email automation for procurement — pilot with 2 suppliers in August, full rollout by end of September" style={{ width: '100%', minHeight: 64, resize: 'none', background: 'var(--inputBg)', border: '1.5px solid var(--line)', borderRadius: 11, padding: '10px 12px', fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.5, outline: 'none' }} />
                <div style={{ marginTop: 9 }}>
                  <span onClick={onbGen} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', border: '1px solid var(--acc2)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }}>
                    {onb.busy
                      ? (<><svg style={{ animation: 'vspin .7s linear infinite' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>Generating plan…</>)
                      : (<><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>Generate plan</>)}
                  </span>
                </div>
                {onb.wbs && (
                  <div style={{ marginTop: 12, border: '1px solid var(--acc2)', background: 'var(--accS)', borderRadius: 13, padding: 13, animation: 'vup .2s ease' }}>
                    <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>✦ Generated work breakdown — {onb.wbs.length} phases · {onb.wbs.reduce((a: number, w: any) => a + (w.items?.length || 0), 0)} tasks</div>
                    {onb.wbs.map((w: any, wi: number) => (
                      <div key={wi}>
                        <div style={{ fontSize: 12, fontWeight: 700, margin: '7px 0 3px' }}>{w.ph}</div>
                        {(w.items || []).map((n: string, xi: number) => (
                          <div key={xi} style={{ fontSize: 11.5, color: 'var(--txt2)', padding: '1.5px 0 1.5px 14px', position: 'relative' }}><span style={{ position: 'absolute', left: 2, top: 7, width: 5, height: 5, borderRadius: '50%', background: 'var(--acc)' }} />{n}</div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 18, alignItems: 'center' }}>
              {onb.newProj
                ? <span />
                : <span onClick={() => setOnb({ step: Math.max(1, onb.step - 1) })} style={{ fontSize: 13, fontWeight: 600, color: 'var(--txt2)', cursor: 'pointer', padding: '9px 6px' }}>← Back</span>}
              <span onClick={onbFinish} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 13, fontWeight: 700, color: '#fff', background: finReady && !onb.creating ? 'var(--acc)' : 'var(--muB)', borderRadius: 10, padding: '9px 20px', cursor: finReady && !onb.creating ? 'pointer' : 'not-allowed' }}>
                {onb.creating && <svg style={{ animation: 'vspin .7s linear infinite' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>}
                {onb.creating ? 'Creating…' : 'Create project ✓'}
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
