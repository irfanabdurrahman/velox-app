import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { api } from '../api';
import { Burndown, VelocityBars, Sparkline } from '../components/Charts';
import { fmt, TODAY, dateOf } from '../lib/dates';
import { MO } from '../lib/meta';
import type { Project, StatusUpdatePost } from '../types';

const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function Home() {
  const s = useStore();
  const [burndown, setBurndown] = useState<any>(null);
  const [velocity, setVelocity] = useState<Array<{ week: string; done: number }> | null>(null);
  const dash = s.dash;
  const dhCatF = dash.cat;

  const td = dateOf(TODAY);
  const dhDate = WD[td.getUTCDay()] + ', ' + MO[td.getUTCMonth()] + ' ' + td.getUTCDate() + ' ' + td.getUTCFullYear();
  const dhPeriod = MO[td.getUTCMonth()] + ' – ' + MO[Math.min(11, td.getUTCMonth() + 5)] + ' ' + td.getUTCFullYear();

  const wsProjects = s.projects.filter((p) => p.ws === s.ws);
  const dhProjs = wsProjects.filter((p) => dhCatF === 'all' || p.cat === dhCatF);
  const dhProjIds = new Set(dhProjs.map((p) => p.id));
  const overTasksAll = s.tasks.filter((t) => !t.ms && t.s !== null && t.st !== 'done' && t.e != null && t.e < TODAY);
  const overByProj: Record<string, number> = {};
  overTasksAll.forEach((t) => { overByProj[t.pid] = (overByProj[t.pid] || 0) + 1; });
  const dhRiskN = dhProjs.filter((p) => p.st === 'risk').length;

  const ragC: Record<string, string> = { ok: 'var(--ok)', risk: 'var(--wa)', bad: 'var(--bd)', mut: 'var(--txt3)' };
  const pStL: Record<string, string> = { ok: 'On track', risk: 'At risk', bad: 'Off track', mut: 'Not started' };
  const pStB: Record<string, string> = { ok: 'var(--okB)', risk: 'var(--waB)', bad: 'var(--bdB)', mut: 'var(--muB)' };
  const pStT: Record<string, string> = { ok: 'var(--okT)', risk: 'var(--waT)', bad: 'var(--bdT)', mut: 'var(--muT)' };
  const whyMap: Record<string, string> = {
    karawang: 'IMB permit at 35% sits on the critical chain — 6 working days of float left before Production restart slips.',
    gln: 'Vendor SIT environment 4d late; UAT compression required to hold the Sep 30 go-live.',
    cqi: 'Camera procurement lead time 6w vs 4w planned; dataset sprint can absorb 2w max.',
    qcc12: 'Facilitator double-booked in W31; batch schedule still unconfirmed.',
    helpdesk: '3 tasks overdue; KB migration blocked on vendor export.',
  };

  const openProj = (p: Project) => s.set({ screen: 'project', projectId: p.id, view: 'pdash', dash: { ...s.dash, fromExec: true } as any });

  // Latest status update per project (from the live store) — must be computed
  // before dhProjRows uses it.
  const latestSU: Record<string, StatusUpdatePost> = {};
  s.statusUpdates.forEach((u) => { const cur = latestSU[u.pid]; if (!cur || u.when > cur.when) latestSU[u.pid] = u; });

  const dhProjRows = dhProjs.map((p) => ({
    n: p.name, rag: ragC[p.st], cat: (s.categories.find((c) => c.id === p.cat) || ({} as any)).label,
    av: p.owner, avBg: s.members[p.owner]?.c || '#6366F1', avN: (s.members[p.owner]?.n || p.owner).split(' ')[0],
    prog: p.prog, progC: p.st === 'bad' ? 'var(--bd)' : (p.st === 'risk' ? 'var(--wa)' : 'var(--acc)'),
    due: p.due == null ? '—' : fmt(p.due), dueCo: p.due != null && p.due < TODAY ? 'var(--bdT)' : 'var(--txt3)', dueFw: p.due != null && p.due < TODAY ? 700 : 500,
    stL: pStL[p.st], stB: pStB[p.st], stT: pStT[p.st],
    su: latestSU[p.id] || null,
    oC: () => openProj(p),
  }));

  const dhL1Filter = dash.filter;
  const dhL1Projs = dhL1Filter === 'over' ? dhProjs.filter((p) => overByProj[p.id]) : dhProjs.filter((p) => p.st === 'risk');

  // Workload heatmap — real workload hours & week labels for members of the current workspace.
  const wsMemberIds = s.memberships.filter((m) => m.ws === s.ws).map((m) => m.userId).filter((id) => s.members[id]);
  const heatPpl = (wsMemberIds.length ? wsMemberIds : Object.keys(s.workload).filter((id) => s.members[id])).slice(0, 4);
  const dhHeat: Array<{ isLbl: boolean; isCell: boolean; l?: string; c?: string; t?: string }> = [];
  heatPpl.forEach((pid) => {
    dhHeat.push({ isLbl: true, isCell: false, l: s.members[pid].n.split(' ')[0] });
    for (let i = 0; i < 6; i++) {
      const h = (s.workload[pid] || [])[i] || 0;
      const a = Math.min(1, h / 52);
      dhHeat.push({ isLbl: false, isCell: true, c: h > 40 ? 'var(--bd)' : 'rgba(99,102,241,' + (0.12 + a * 0.75).toFixed(2) + ')', t: s.members[pid].n + ' · ' + (s.workloadWeeks[i] || 'Week ' + (i + 1)) + ' · ' + h + 'h' });
    }
  });

  // Upcoming milestones — real milestone tasks across the user's projects.
  const dhMs = s.tasks
    .filter((t) => t.ms && dhProjIds.has(t.pid) && t.st !== 'done' && t.e != null && t.e >= TODAY)
    .sort((a, b) => (a.e as number) - (b.e as number))
    .slice(0, 6)
    .map((t) => ({
      n: t.name, p: s.proj(t.pid)?.name || '', d: fmt(t.e as number),
      oC: () => s.set({ screen: 'project', projectId: t.pid, view: 'gantt', selId: t.id }),
    }));

  // Burndown — largest at-risk project (most tasks).
  const taskCountByProj: Record<string, number> = {};
  s.tasks.forEach((t) => { if (!t.ms) taskCountByProj[t.pid] = (taskCountByProj[t.pid] || 0) + 1; });
  const riskProjs = dhProjs.filter((p) => p.st === 'risk' || p.st === 'bad');
  const bdProj = (riskProjs.length ? riskProjs : dhProjs).slice().sort((a, b) => (taskCountByProj[b.id] || 0) - (taskCountByProj[a.id] || 0))[0] || null;
  const bdProjId = bdProj?.id;

  // Real report data — fetched with local state (loading via null).
  useEffect(() => {
    if (!bdProjId) { setBurndown(null); return; }
    let alive = true;
    api.reportBurndown(bdProjId).then((d) => { if (alive) setBurndown(d); }).catch(() => { if (alive) setBurndown(null); });
    return () => { alive = false; };
  }, [bdProjId]);
  useEffect(() => {
    let alive = true;
    setVelocity(null);
    api.reportVelocity(s.ws).then((d) => { if (alive) setVelocity(d); }).catch(() => { if (alive) setVelocity([]); });
    return () => { alive = false; };
  }, [s.ws]);
  // Completion trend — derived from real weekly velocity (done counts).
  const velPoints = (velocity || []).map((w) => w.done);

  // Done rate — % of done leaf (non-milestone, non-parent) tasks across the portfolio.
  const parentIds = new Set(s.tasks.filter((t) => t.par).map((t) => t.par as string));
  const leafTasks = s.tasks.filter((t) => !t.ms && !parentIds.has(t.id) && dhProjIds.has(t.pid));
  const doneRate = leafTasks.length ? Math.round((leafTasks.filter((t) => t.st === 'done').length / leafTasks.length) * 100) : null;

  const dhWs = (s.workspaces.find((w) => w.id === s.ws) || ({} as any)).name;
  const dhActive = dhProjs.length;
  const dhOnPct = (() => {
    const lv = s.tasks.filter((t) => !t.ms && t.s !== null && dhProjs.some((p) => p.id === t.pid));
    const good = lv.filter((t) => t.st === 'done' || t.st === 'prog' || t.st === 'mut').length;
    return lv.length ? Math.round((good / lv.length) * 100) : 0;
  })();
  const dhOverN = overTasksAll.filter((t) => dhProjs.some((p) => p.id === t.pid)).length;
  const dhOverP = Object.keys(overByProj).filter((pid) => dhProjs.some((p) => p.id === pid)).length;

  const dhCats = ([{ id: 'all', l: 'All' }] as Array<{ id: string; l: string }>)
    .concat(s.categories.filter((c) => wsProjects.some((p) => p.cat === c.id)).map((c) => ({ id: c.id, l: c.label })))
    .map((c) => ({
      l: c.l,
      bd: dhCatF === c.id ? 'var(--acc)' : 'var(--line)',
      co: dhCatF === c.id ? 'var(--accT)' : 'var(--txt2)',
      bg: dhCatF === c.id ? 'var(--accS)' : 'var(--card)',
      oC: () => s.set((x) => ({ dash: { ...x.dash, cat: c.id } })),
    }));

  const dhL1Title = dhL1Filter === 'over' ? 'Projects with overdue tasks' : 'At-risk projects';
  const dhL1Sub = dhL1Filter === 'over'
    ? overTasksAll.length + ' overdue tasks across ' + dhL1Projs.length + ' projects'
    : dhL1Projs.length + ' projects flagged by status or AI forecast';
  const dhL1Rows = dhL1Projs.map((p) => ({
    n: p.name, rag: ragC[p.st],
    stL: dhL1Filter === 'over' ? (overByProj[p.id] || 0) + ' overdue' : pStL[p.st],
    stB: dhL1Filter === 'over' ? 'var(--bdB)' : pStB[p.st],
    stT: dhL1Filter === 'over' ? 'var(--bdT)' : pStT[p.st],
    why: whyMap[p.id] || (overByProj[p.id]
      ? overByProj[p.id] + ' overdue task' + (overByProj[p.id] === 1 ? '' : 's') + ' · ' + p.prog + '% complete'
      : 'Status: ' + pStL[p.st] + ' · ' + p.prog + '% complete'),
    av: p.owner, avBg: s.members[p.owner]?.c || '#6366F1', avN: s.members[p.owner]?.n || p.owner,
    due: p.due == null ? '—' : fmt(p.due), prog: p.prog,
    progC: p.st === 'bad' ? 'var(--bd)' : (p.st === 'risk' ? 'var(--wa)' : 'var(--acc)'),
    oC: () => openProj(p),
  }));

  const cols = '14px minmax(150px,1.6fr) minmax(86px,1fr) minmax(86px,1fr) minmax(96px,1.1fr) 58px 82px';

  return (
    <div data-screen-label="Executive Dashboard" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      {dash.lvl === 0 && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 13, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Executive Dashboard</span>
            <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{dhDate}</span>
            <span style={{ flex: 1 }} />
            <span style={{ fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 99, padding: '4.5px 11px', color: 'var(--txt2)', background: 'var(--card)' }}>{dhWs} ▾</span>
            {dhCats.map((c, i) => (
              <span key={i} onClick={c.oC} style={{ fontSize: 11, fontWeight: 600, border: '1px solid ' + c.bd, borderRadius: 99, padding: '4.5px 11px', color: c.co, background: c.bg, cursor: 'pointer' }}>{c.l}</span>
            ))}
            <span style={{ fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 99, padding: '4.5px 11px', color: 'var(--txt2)', background: 'var(--card)' }}>{dhPeriod}</span>
            <span onClick={() => s.pushToast('Demo preview — export is not yet functional')} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '5.5px 12px', cursor: 'pointer' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>Export
            </span>
          </div>

          {wsProjects.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 14, padding: '48px 20px', textAlign: 'center', boxShadow: 'var(--sh1)' }}>
            <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 5 }}>No projects yet</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 14 }}>Create your first project to see portfolio health, workload, and milestones here.</div>
            <span onClick={() => s.set({ onb: { step: 3, newProj: true } })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 9, padding: '8px 16px', cursor: 'pointer', boxShadow: '0 1px 3px var(--ring)' }}>＋ Create project</span>
          </div>
          ) : (
          <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(164px,1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--accS)', border: '1px solid var(--acc2)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
              <div style={{ fontSize: 10.5, color: 'var(--accT)', fontWeight: 700 }}>Active projects</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>{dhActive}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600, marginTop: 4 }}>{dhWs}</div>
            </div>
            <div style={{ background: 'var(--okB)', border: '1px solid var(--ok)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
              <div style={{ fontSize: 10.5, color: 'var(--okT)', fontWeight: 700 }}>On track</div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--okT)' }}>{dhOnPct}%</div>
              <div style={{ height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginTop: 7 }}><div style={{ width: dhOnPct + '%', height: '100%', background: 'var(--ok)' }} /></div>
            </div>
            <Hover onClick={() => s.set((x) => ({ dash: { ...x.dash, lvl: 1, filter: 'risk' } }))} style={{ background: 'var(--waB)', border: '1.5px solid var(--wa)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)', cursor: 'pointer', transition: 'transform .15s' }} hover={{ transform: 'translateY(-2px)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 10.5, color: 'var(--waT)', fontWeight: 700 }}>At risk</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--waT)" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg></div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--waT)' }}>{dhRiskN}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600, marginTop: 4 }}>click to drill down</div>
            </Hover>
            <Hover onClick={() => s.set((x) => ({ dash: { ...x.dash, lvl: 1, filter: 'over' } }))} style={{ background: 'var(--bdB)', border: '1.5px solid var(--bd)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)', cursor: 'pointer', transition: 'transform .15s' }} hover={{ transform: 'translateY(-2px)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}><span style={{ fontSize: 10.5, color: 'var(--bdT)', fontWeight: 700 }}>Overdue tasks</span><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--bdT)" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg></div>
              <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--bdT)' }}>{dhOverN}</div>
              <div style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600, marginTop: 4 }}>across {dhOverP} projects</div>
            </Hover>
            {doneRate !== null && (
              <div style={{ background: 'rgba(139,92,246,.14)', border: '1px solid var(--acc2)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
                <div style={{ fontSize: 10.5, color: 'var(--accT)', fontWeight: 700 }}>Done rate</div>
                <div style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-.02em' }}>{doneRate}%</div>
                <div style={{ height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginTop: 7 }}><div style={{ width: doneRate + '%', height: '100%', background: 'var(--acc)' }} /></div>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(420px,100%),1fr))', gap: 10, marginBottom: 12 }}>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', padding: '12px 15px 9px' }}><span style={{ fontSize: 12.5, fontWeight: 800 }}>Portfolio health</span><span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--txt3)' }}>click a row to drill in</span></div>
              <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '5px 15px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)' }}>
                <span /><span>Project</span><span>Category</span><span>Owner</span><span>Progress</span><span>Due</span><span>Status</span>
              </div>
              {dhProjRows.map((p, i) => (
                <Hover key={i} onClick={p.oC} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '8.5px 15px', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid var(--line2)' }} hover={{ background: 'var(--hover)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: '50%', background: p.rag }} />
                  <span style={{ fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.n}</span>
                    {p.su && (
                      <svg title={(pStL[p.su.status] || p.su.status) + ' — ' + p.su.summary} style={{ flex: 'none', color: ragC[p.su.status] || 'var(--txt3)' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
                    )}
                  </span>
                  <span style={{ fontSize: 10.5, color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.cat}</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: p.avBg, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800 }}>{p.av}</span><span style={{ fontSize: 10.5, color: 'var(--txt2)' }}>{p.avN}</span></span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><span style={{ display: 'block', width: p.prog + '%', height: '100%', background: p.progC, borderRadius: 99 }} /></span><span style={{ fontSize: 10, fontWeight: 700, width: 26 }}>{p.prog}%</span></span>
                  <span style={{ fontSize: 10.5, color: p.dueCo, fontWeight: p.dueFw }}>{p.due}</span>
                  <span><span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.stB, color: p.stT }}>{p.stL}</span></span>
                </Hover>
              ))}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, minWidth: 0 }}>
              {bdProj && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', padding: '12px 15px' }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}><span style={{ fontSize: 12.5, fontWeight: 800, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Burndown — {bdProj.name}</span><span style={{ fontSize: 9.5, color: 'var(--txt3)', flex: 'none' }}>plan vs actual</span></div>
                  {burndown == null
                    ? <div style={{ height: 110, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>Loading burndown…</div>
                    : (burndown.points && burndown.points.length
                      ? <Burndown data={burndown} />
                      : <div style={{ height: 110, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>No scheduled tasks to chart yet</div>)}
                </div>
              )}
              <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', padding: '12px 15px' }}>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 6 }}><span style={{ fontSize: 12.5, fontWeight: 800 }}>Velocity</span><span style={{ fontSize: 9.5, color: 'var(--txt3)' }}>tasks done · last 6 weeks</span></div>
                {velocity == null
                  ? <div style={{ height: 90, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>Loading velocity…</div>
                  : (velocity.some((w) => w.done > 0)
                    ? <>
                        <VelocityBars data={velocity} />
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--line2)' }}>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', flex: 'none' }}>Completion trend</span>
                          <Sparkline points={velPoints} color="var(--acc)" />
                        </div>
                      </>
                    : <div style={{ height: 90, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>No completed tasks in the last 6 weeks</div>)}
              </div>
              {dhHeat.length > 0 && (
                <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', padding: '12px 15px' }}>
                  <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 8 }}>Workload heatmap</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '56px repeat(6,1fr)', gap: 3, fontSize: 8.5, color: 'var(--txt3)', alignItems: 'center' }}>
                    {dhHeat.map((h, i) => h.isLbl
                      ? <span key={i} style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.l}</span>
                      : <span key={i} title={h.t} style={{ height: 16, borderRadius: 4, background: h.c }} />)}
                  </div>
                </div>
              )}
            </div>
          </div>

          {dhMs.length > 0 && (
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', padding: '12px 15px' }}>
              <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 9 }}>Upcoming milestones</div>
              <div style={{ display: 'flex', gap: 9, overflowX: 'auto', paddingBottom: 4 }}>
                {dhMs.map((m, i) => (
                  <Hover key={i} onClick={m.oC} style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 9, border: '1px solid var(--acc2)', borderRadius: 11, padding: '9px 13px', cursor: 'pointer', background: 'var(--accS)' }} hover={{ boxShadow: 'var(--sh2)' }}>
                    <span style={{ width: 12, height: 12, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 3, flex: 'none' }} />
                    <span><span style={{ display: 'block', fontSize: 11.5, fontWeight: 700, whiteSpace: 'nowrap' }}>{m.n}</span><span style={{ display: 'block', fontSize: 9.5, color: 'var(--txt3)' }}>{m.p} · {m.d}</span></span>
                  </Hover>
                ))}
              </div>
            </div>
          )}
          </>
          )}
        </>
      )}

      {dash.lvl === 1 && (
        <>
          <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginBottom: 12 }}><span onClick={() => s.set((x) => ({ dash: { ...x.dash, lvl: 0 } }))} style={{ color: 'var(--accT)', cursor: 'pointer', fontWeight: 600 }}>Dashboard</span> / <b style={{ color: 'var(--txt)' }}>{dhL1Title}</b></div>
          <div style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>{dhL1Title}</div>
          <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 14 }}>{dhL1Sub} · click a project to open its mini-dashboard</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(300px,1fr))', gap: 10 }}>
            {dhL1Rows.map((p, i) => (
              <Hover key={i} onClick={p.oC} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', cursor: 'pointer', boxShadow: 'var(--sh1)', transition: 'transform .15s' }} hover={{ transform: 'translateY(-2px)', borderColor: 'var(--acc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}><span style={{ width: 9, height: 9, borderRadius: '50%', background: p.rag }} /><span style={{ fontSize: 13, fontWeight: 700, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.n}</span><span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: p.stB, color: p.stT }}>{p.stL}</span></div>
                <div style={{ fontSize: 11, color: 'var(--txt2)', lineHeight: 1.5, marginBottom: 9 }}>{p.why}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}><span style={{ width: 18, height: 18, borderRadius: '50%', background: p.avBg, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800 }}>{p.av}</span><span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{p.avN} · due {p.due}</span><span style={{ marginLeft: 'auto', flex: 'none', width: 70, height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><span style={{ display: 'block', width: p.prog + '%', height: '100%', background: p.progC }} /></span><span style={{ fontSize: 10, fontWeight: 700 }}>{p.prog}%</span></div>
              </Hover>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
