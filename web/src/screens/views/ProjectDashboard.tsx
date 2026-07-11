import { useEffect, useState } from 'react';
import { useStore } from '../../store';
import { Hover } from '../../components/Hover';
import { api } from '../../api';
import { Burndown, CumulativeFlow } from '../../components/Charts';
import { stMeta, dotFor } from '../../lib/meta';
import { fmt, TODAY } from '../../lib/dates';

const SU_OPTS: Array<{ v: 'ok' | 'risk' | 'bad'; l: string; b: string; t: string }> = [
  { v: 'ok', l: 'On track', b: 'var(--okB)', t: 'var(--okT)' },
  { v: 'risk', l: 'At risk', b: 'var(--waB)', t: 'var(--waT)' },
  { v: 'bad', l: 'Off track', b: 'var(--bdB)', t: 'var(--bdT)' },
];

export function ProjectDashboard() {
  const s = useStore();
  const pid = s.projectId;
  const [burndown, setBurndown] = useState<any>(null);
  const [cfd, setCfd] = useState<any[] | null>(null);
  const [suStatus, setSuStatus] = useState<'ok' | 'risk' | 'bad'>('ok');
  const [suText, setSuText] = useState('');
  const [suBusy, setSuBusy] = useState(false);

  useEffect(() => {
    if (!pid) { setBurndown(null); setCfd(null); return; }
    let alive = true;
    setBurndown(null); setCfd(null);
    api.reportBurndown(pid).then((d) => { if (alive) setBurndown(d); }).catch(() => { if (alive) setBurndown(false); });
    api.reportCfd(pid).then((d) => { if (alive) setCfd(d); }).catch(() => { if (alive) setCfd([]); });
    return () => { alive = false; };
  }, [pid]);

  const projTasks = s.tasks.filter((t) => t.pid === s.projectId);
  const leafs = projTasks.filter((t) => !t.ms && t.s !== null && !projTasks.some((x) => x.par === t.id));
  const proj = s.proj(s.projectId) || s.projects[0];

  const pdOverN = projTasks.filter((t) => !t.ms && t.s !== null && t.st !== 'done' && (t.e as number) < TODAY).length;
  const pdDoneN = leafs.filter((t) => t.st === 'done').length;
  const pdProg = leafs.length ? Math.round(leafs.reduce((a, t) => a + t.pg, 0) / leafs.length) : 0;
  const phases = projTasks.filter((t) => !t.par && projTasks.some((x) => x.par === t.id));
  const pdAttn = projTasks.filter((t) => t.s !== null && !t.ms && (t.st === 'risk' || t.st === 'bad')).slice(0, 5);

  const pdFromExec = !!(s.dash as any).fromExec;
  const pdL1Label = s.dash.filter === 'over' ? 'Overdue tasks' : 'At-risk projects';
  const pdOverCo = pdOverN ? 'var(--bdT)' : 'var(--txt)';
  const pdDue = proj && proj.due != null ? fmt(proj.due) : '—';
  const pdSlack = proj?.st === 'risk' ? 'at risk' : 'on plan';
  const pdSlackCo = proj?.st === 'risk' ? 'var(--waT)' : 'var(--okT)';

  const pdPhases = phases.map((f, i) => {
    const lv = s.desc(f.id).filter((x) => !x.ms && !projTasks.some((y) => y.par === x.id));
    const pct = lv.length ? Math.round(lv.reduce((a, x) => a + x.pg, 0) / lv.length) : f.pg;
    return { n: f.name, pct, c: ['var(--acc)', 'var(--acc2)', '#0EA5E9'][i % 3], range: (f.s != null ? fmt(f.s) : '—') + ' – ' + (f.e != null ? fmt(f.e) : '—') };
  });
  const pdMs = projTasks.filter((t) => t.ms).map((m) => ({ n: m.name, d: m.e != null ? fmt(m.e) : '—', oC: () => s.openTask(m.id) }));
  const pdAttnVM = pdAttn.map((t) => {
    const st = stMeta(t.st);
    return {
      n: t.name, dot: dotFor(t.st),
      meta: (t.a && s.members[t.a] ? s.members[t.a].n + ' · ' : '') + 'due ' + (t.e != null ? fmt(t.e) : '—') + (s.kids(t.id).length ? ' · ' + s.kids(t.id).length + ' subtasks' : ''),
      stL: st.l, stB: st.b, stT: st.t, oC: () => s.openTask(t.id),
    };
  });
  // this week = week index 0 of the workload map; rows = members of this workspace
  const pdLoad = Array.from(new Set(
    s.memberships.filter((m) => m.ws === (proj?.ws ?? s.ws) && s.members[m.userId] && s.workload[m.userId]).map((m) => m.userId),
  )).slice(0, 4).map((k) => {
    const h = s.workload[k]?.[0] ?? 0;
    return { av: k, avBg: s.members[k].c, pct: Math.min(100, Math.round((h / 40) * 100)), h, c: h > 40 ? 'var(--bd)' : 'var(--acc)', co: h > 40 ? 'var(--bdT)' : 'var(--txt3)' };
  });

  const canPost = !['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws] || '');
  const projSU = s.statusUpdates.filter((u) => u.pid === s.projectId).slice().sort((a, b) => (a.when < b.when ? 1 : -1))[0] || null;
  const suMeta = (st: string) => SU_OPTS.find((o) => o.v === st) || SU_OPTS[0];
  const postSU = async () => {
    if (!suText.trim() || suBusy) return;
    setSuBusy(true);
    try {
      const row = await api.postStatus(s.projectId, suStatus, suText.trim());
      s.set((st) => ({ statusUpdates: [...st.statusUpdates, row] }));
      setSuText('');
      s.pushToast('Status update posted');
    } catch (e: any) {
      s.pushToast(e?.message || 'Failed to post status update', 'bad');
    } finally {
      setSuBusy(false);
    }
  };

  if (!proj) {
    return (
      <div data-screen-label="Project dashboard" style={{ flex: 1, minHeight: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 15, fontWeight: 800, marginBottom: 5 }}>No projects yet</div>
          <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Create a project to see its dashboard here.</div>
        </div>
      </div>
    );
  }

  return (
    <div data-screen-label="Project dashboard" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 18px' }}>
      {pdFromExec && (
        <div style={{ fontSize: 11.5, color: 'var(--txt3)', marginBottom: 10 }}>
          <span onClick={() => s.set({ screen: 'home', dash: { ...s.dash, lvl: 0, fromExec: false } as any })} style={{ color: 'var(--accT)', cursor: 'pointer', fontWeight: 600 }}>Dashboard</span>
          {' / '}
          <span onClick={() => s.set({ screen: 'home', dash: { ...s.dash, lvl: 1, fromExec: false } as any })} style={{ color: 'var(--accT)', cursor: 'pointer', fontWeight: 600 }}>{pdL1Label}</span>
          {' / '}
          <b style={{ color: 'var(--txt)' }}>{proj.name}</b>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 10, marginBottom: 12 }}>
        <div style={{ background: 'var(--accS)', border: '1px solid var(--acc2)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--accT)', fontWeight: 700 }}>Overall progress</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>{pdProg}%</div>
          <div style={{ height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginTop: 6 }}><div style={{ width: pdProg + '%', height: '100%', background: 'var(--acc)' }} /></div>
        </div>
        <div style={{ background: 'var(--okB)', border: '1px solid var(--ok)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--okT)', fontWeight: 700 }}>Tasks done</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>{pdDoneN}<span style={{ fontSize: 13, color: 'var(--txt3)', fontWeight: 600 }}> / {leafs.length}</span></div>
          <div style={{ fontSize: 10.5, color: 'var(--okT)', fontWeight: 600, marginTop: 6 }}>{leafs.length ? Math.round((pdDoneN / leafs.length) * 100) + '% complete' : '—'}</div>
        </div>
        <div style={{ background: 'var(--bdB)', border: '1px solid var(--bd)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--bdT)', fontWeight: 700 }}>Overdue</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em', color: pdOverCo }}>{pdOverN}</div>
          <div style={{ fontSize: 11, color: 'var(--txt2)', fontWeight: 600, marginTop: 6 }}>tasks past due</div>
        </div>
        <div style={{ background: 'rgba(139,92,246,.14)', border: '1px solid var(--acc2)', borderRadius: 14, padding: '13px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ fontSize: 10.5, color: 'var(--accT)', fontWeight: 700 }}>Target finish</div>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.02em' }}>{pdDue}</div>
          <div style={{ fontSize: 10.5, color: pdSlackCo, fontWeight: 600, marginTop: 6 }}>{pdSlack}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: 10 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, marginBottom: 10 }}>Phases</div>
          {pdPhases.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 9 }}>
              <span style={{ width: 170, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 'none' }}>{f.n}</span>
              <div style={{ flex: 1, height: 7, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><div style={{ width: f.pct + '%', height: '100%', background: f.c, borderRadius: 99 }} /></div>
              <span style={{ fontSize: 10.5, color: 'var(--txt3)', width: 64, flex: 'none', textAlign: 'right' }}>{f.range}</span>
              <span style={{ fontSize: 11, fontWeight: 700, width: 34, textAlign: 'right', flex: 'none' }}>{f.pct}%</span>
            </div>
          ))}
          <div style={{ fontSize: 12, fontWeight: 800, margin: '14px 0 8px' }}>Milestones</div>
          {pdMs.map((m, i) => (
            <Hover key={i} onClick={m.oC} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 8px', borderRadius: 9, cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}>
              <span style={{ width: 11, height: 11, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 2.5, flex: 'none' }} />
              <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>{m.n}</span>
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{m.d}</span>
            </Hover>
          ))}
        </div>

        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Needs attention</span><span style={{ fontSize: 9.5, fontWeight: 800, background: 'var(--bdB)', color: 'var(--bdT)', borderRadius: 99, padding: '2px 8px' }}>{pdAttnVM.length}</span><span style={{ marginLeft: 'auto', fontSize: 10, color: 'var(--txt3)' }}>click → task detail</span></div>
          {pdAttnVM.map((a, i) => (
            <Hover key={i} onClick={a.oC} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '8px 9px', borderRadius: 10, cursor: 'pointer', border: '1px solid var(--line2)', marginBottom: 6 }} hover={{ borderColor: 'var(--acc)', background: 'var(--accS)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: a.dot, flex: 'none' }} />
              <span style={{ flex: 1, minWidth: 0 }}><span style={{ display: 'block', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.n}</span><span style={{ display: 'block', fontSize: 10, color: 'var(--txt3)' }}>{a.meta}</span></span>
              <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: a.stB, color: a.stT, flex: 'none' }}>{a.stL}</span>
            </Hover>
          ))}
          <div style={{ fontSize: 12, fontWeight: 800, margin: '12px 0 8px' }}>Team load (this week)</div>
          {pdLoad.length === 0 && <div style={{ fontSize: 11, color: 'var(--txt3)' }}>Load is computed from assigned, scheduled tasks.</div>}
          {pdLoad.map((l, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ width: 20, height: 20, borderRadius: '50%', background: l.avBg, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 7.5, fontWeight: 800, flex: 'none' }}>{l.av}</span>
              <div style={{ flex: 1, height: 6, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><div style={{ width: l.pct + '%', height: '100%', background: l.c, borderRadius: 99 }} /></div>
              <span style={{ fontSize: 10, color: l.co, fontWeight: 700, width: 30, textAlign: 'right' }}>{l.h}h</span>
            </div>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(min(380px,100%),1fr))', gap: 10, marginTop: 12 }}>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Burndown</span><span style={{ fontSize: 9.5, color: 'var(--txt3)' }}>plan vs remaining vs completed</span></div>
          {burndown === null
            ? <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>Loading burndown…</div>
            : burndown === false
              ? <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--bdT)' }}>Could not load burndown</div>
              : (burndown.points && burndown.points.length
                ? <Burndown data={burndown} />
                : <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>No scheduled tasks to chart yet</div>)}
        </div>
        <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', boxShadow: 'var(--sh1)' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 8 }}><span style={{ fontSize: 12, fontWeight: 800 }}>Cumulative flow</span><span style={{ fontSize: 9.5, color: 'var(--txt3)' }}>tasks by status · last 8 weeks</span></div>
          {cfd === null
            ? <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>Loading flow…</div>
            : (cfd.length
              ? <CumulativeFlow data={cfd} />
              : <div style={{ height: 120, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>No task history yet</div>)}
        </div>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '14px 15px', boxShadow: 'var(--sh1)', marginTop: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
          <span style={{ fontSize: 12, fontWeight: 800 }}>Status update</span>
          {projSU && <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: suMeta(projSU.status).b, color: suMeta(projSU.status).t }}>{suMeta(projSU.status).l}</span>}
        </div>
        {projSU
          ? <div style={{ border: '1px solid var(--line2)', borderRadius: 10, padding: '9px 11px', marginBottom: canPost ? 12 : 0 }}>
              <div style={{ fontSize: 12, color: 'var(--txt)', lineHeight: 1.5 }}>{projSU.summary}</div>
              <div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 5 }}>{(projSU.author && s.members[projSU.author] ? s.members[projSU.author].n + ' · ' : '') + new Date(projSU.when).toLocaleString()}</div>
            </div>
          : <div style={{ fontSize: 11, color: 'var(--txt3)', marginBottom: canPost ? 12 : 0 }}>No status update posted yet.</div>}
        {canPost && (
          <div>
            <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
              {SU_OPTS.map((o) => (
                <span key={o.v} onClick={() => setSuStatus(o.v)} style={{ fontSize: 10.5, fontWeight: 700, padding: '5px 11px', borderRadius: 8, cursor: 'pointer', background: suStatus === o.v ? o.b : 'var(--bg)', color: suStatus === o.v ? o.t : 'var(--txt3)', border: '1px solid ' + (suStatus === o.v ? o.t : 'var(--line)') }}>{o.l}</span>
              ))}
            </div>
            <textarea
              value={suText}
              onChange={(e) => setSuText(e.target.value)}
              placeholder="Summarise this week's progress, blockers, and next steps…"
              rows={2}
              style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 9, padding: '8px 10px', fontSize: 12, color: 'var(--txt)', fontFamily: 'inherit' }}
            />
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
              <span onClick={postSU} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: suText.trim() && !suBusy ? 'var(--acc)' : 'var(--txt3)', borderRadius: 8, padding: '7px 14px', cursor: suText.trim() && !suBusy ? 'pointer' : 'default', opacity: suText.trim() && !suBusy ? 1 : 0.6 }}>{suBusy ? 'Posting…' : 'Post status update'}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
