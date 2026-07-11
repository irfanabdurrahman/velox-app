import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { api } from '../api';
import { VelocityBars, CumulativeFlow } from '../components/Charts';
import { TODAY } from '../lib/dates';

type Tab = 'velocity' | 'timesheet' | 'portfolio' | 'cfd';
type CfdRow = { week: string; mut: number; prog: number; risk: number; bad: number; done: number };

const TABS: Array<{ id: Tab; l: string }> = [
  { id: 'velocity', l: 'Velocity' },
  { id: 'timesheet', l: 'Timesheet' },
  { id: 'portfolio', l: 'Portfolio' },
  { id: 'cfd', l: 'Cumulative flow' },
];

const ragMeta: Record<string, { l: string; b: string; t: string; c: string }> = {
  ok: { l: 'On track', b: 'var(--okB)', t: 'var(--okT)', c: 'var(--ok)' },
  risk: { l: 'At risk', b: 'var(--waB)', t: 'var(--waT)', c: 'var(--wa)' },
  bad: { l: 'Off track', b: 'var(--bdB)', t: 'var(--bdT)', c: 'var(--bd)' },
  mut: { l: 'Not started', b: 'var(--muB)', t: 'var(--muT)', c: 'var(--txt3)' },
};

const card = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)' } as const;
const centered = { display: 'grid', placeItems: 'center', padding: '40px 16px', fontSize: 12, color: 'var(--txt3)' } as const;

export function Reports() {
  const s = useStore();
  const [ws, setWs] = useState(s.ws);
  const [tab, setTab] = useState<Tab>('velocity');
  const [cfdPid, setCfdPid] = useState('');
  const [state, setState] = useState<{ loading: boolean; error: string | null; data: any }>({ loading: true, error: null, data: null });

  const wsProjects = s.projects.filter((p) => p.ws === ws);

  // default / reset the CFD project when the workspace changes
  useEffect(() => {
    const first = s.projects.find((p) => p.ws === ws);
    setCfdPid(first ? first.id : '');
  }, [ws]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let alive = true;
    setState({ loading: true, error: null, data: null });
    (async () => {
      try {
        let data: any;
        if (tab === 'velocity') data = await api.reportVelocity(ws);
        else if (tab === 'timesheet') data = await api.reportTimesheet(ws, TODAY - 30, TODAY);
        else if (tab === 'portfolio') data = await api.reportPortfolio(ws);
        else {
          if (!cfdPid) { if (alive) setState({ loading: false, error: null, data: null }); return; }
          data = await api.reportCfd(cfdPid);
        }
        if (alive) setState({ loading: false, error: null, data });
      } catch (e: any) {
        if (alive) setState({ loading: false, error: e?.message || 'Failed to load report', data: null });
      }
    })();
    return () => { alive = false; };
  }, [tab, ws, cfdPid]);

  const selStyle = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 10px', fontSize: 12, color: 'var(--txt)', fontWeight: 600, cursor: 'pointer' } as const;

  return (
    <div data-screen-label="Reports" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Reports</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt3)' }}>Workspace</span>
        <select value={ws} onChange={(e) => setWs(e.target.value)} style={selStyle}>
          {s.workspaces.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}
        </select>
      </div>

      <div style={{ display: 'flex', gap: 3, background: 'var(--muB)', borderRadius: 10, padding: 3, marginBottom: 14, width: 'fit-content', maxWidth: '100%', overflowX: 'auto' }}>
        {TABS.map((tb) => {
          const on = tab === tb.id;
          return (
            <Hover key={tb.id} onClick={() => setTab(tb.id)} style={{ fontSize: 11.5, fontWeight: 700, padding: '6px 13px', borderRadius: 8, cursor: 'pointer', whiteSpace: 'nowrap', background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--txt)' : 'var(--txt2)', boxShadow: on ? 'var(--sh1)' : 'none' }} hover={{ background: on ? 'var(--card)' : 'var(--hover)' }}>{tb.l}</Hover>
          );
        })}
      </div>

      {state.loading && <div style={{ ...card, ...centered }}>Loading report…</div>}
      {!state.loading && state.error && <div style={{ ...card, ...centered, color: 'var(--bdT)' }}>{state.error}</div>}

      {!state.loading && !state.error && tab === 'velocity' && <VelocityTab data={state.data} />}
      {!state.loading && !state.error && tab === 'timesheet' && <TimesheetTab data={state.data} ws={ws} />}
      {!state.loading && !state.error && tab === 'portfolio' && <PortfolioTab data={state.data} />}
      {!state.loading && !state.error && tab === 'cfd' && (
        <CfdTab data={state.data} pid={cfdPid} setPid={setCfdPid} projects={wsProjects} selStyle={selStyle} />
      )}
    </div>
  );
}

function VelocityTab({ data }: { data: Array<{ week: string; done: number }> | null }) {
  const rows = data || [];
  const total = rows.reduce((a, r) => a + r.done, 0);
  if (!rows.length || total === 0) return <div style={{ ...card, ...centered }}>No completed tasks in the last 6 weeks.</div>;
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}><span style={{ fontSize: 13, fontWeight: 800 }}>Weekly velocity</span><span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{total} tasks done · last 6 weeks</span></div>
      <VelocityBars data={rows} />
      <div style={{ display: 'flex', gap: 6, marginTop: 12, flexWrap: 'wrap' }}>
        {rows.map((r) => (
          <div key={r.week} style={{ border: '1px solid var(--line2)', borderRadius: 9, padding: '6px 10px', minWidth: 62 }}>
            <div style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 600 }}>{r.week}</div>
            <div style={{ fontSize: 16, fontWeight: 800 }}>{r.done}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TimesheetTab({ data, ws }: { data: { users: Array<{ userId: string; name: string; totalMinutes: number }>; totalMinutes: number } | null; ws: string }) {
  const s = useStore();
  const [email, setEmail] = useState(s.user?.email || '');
  const [cadence, setCadence] = useState<'weekly' | 'daily'>('weekly');
  const [busy, setBusy] = useState(false);
  const users = data?.users || [];
  const totalH = ((data?.totalMinutes || 0) / 60).toFixed(1);

  const schedule = async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const r = await api.scheduleReport(ws, cadence, email.trim());
      s.pushToast(r?.note || 'Report scheduled — delivered when SMTP is configured');
    } catch (e: any) {
      s.pushToast(e?.message || 'Failed to schedule report', 'bad');
    } finally { setBusy(false); }
  };

  return (
    <div style={{ display: 'grid', gap: 12 }}>
      <div style={{ ...card, overflow: 'hidden' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, padding: '13px 16px 9px' }}><span style={{ fontSize: 13, fontWeight: 800 }}>Timesheet</span><span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>logged time · last 30 days · {totalH}h total</span></div>
        {users.length === 0
          ? <div style={{ ...centered }}>No time logged in the last 30 days.</div>
          : (
            <>
              <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 90px', gap: 8, padding: '8px 16px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)', background: 'var(--bg)' }}>
                <span>Member</span><span>Total</span><span style={{ textAlign: 'right' }}>Share</span>
              </div>
              {users.map((u) => {
                const h = (u.totalMinutes / 60).toFixed(1);
                const pct = data && data.totalMinutes ? Math.round((u.totalMinutes / data.totalMinutes) * 100) : 0;
                return (
                  <div key={u.userId} style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr 90px', gap: 8, padding: '9px 16px', alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 12 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: s.members[u.userId]?.c || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800, flex: 'none' }}>{u.userId}</span>
                      <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{u.name}</span>
                    </span>
                    <span style={{ fontWeight: 700 }}>{h}h</span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 6, justifyContent: 'flex-end' }}><span style={{ width: 44, height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><span style={{ display: 'block', width: pct + '%', height: '100%', background: 'var(--acc)' }} /></span><span style={{ fontSize: 10, color: 'var(--txt3)', width: 26, textAlign: 'right' }}>{pct}%</span></span>
                  </div>
                );
              })}
            </>
          )}
      </div>

      <div style={{ ...card, padding: '14px 16px' }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, marginBottom: 4 }}>Schedule this report</div>
        <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginBottom: 10 }}>Recurring email delivery — the schedule is recorded now and delivered once SMTP is configured for this instance.</div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          <select value={cadence} onChange={(e) => setCadence(e.target.value as any)} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--txt)', fontWeight: 600 }}>
            <option value="weekly">Weekly</option>
            <option value="daily">Daily</option>
          </select>
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@company.com" type="email" style={{ flex: 1, minWidth: 180, background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 10px', fontSize: 12, color: 'var(--txt)' }} />
          <span onClick={schedule} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: email.trim() && !busy ? 'var(--acc)' : 'var(--txt3)', borderRadius: 8, padding: '8px 14px', cursor: email.trim() && !busy ? 'pointer' : 'default', opacity: email.trim() && !busy ? 1 : 0.6 }}>{busy ? 'Scheduling…' : 'Schedule report'}</span>
        </div>
      </div>
    </div>
  );
}

function PortfolioTab({ data }: { data: Array<{ id: string; name: string; st: string; prog: number; owner: string; overdueCount: number; taskCount: number; doneCount: number; lastStatusUpdate: string | null }> | null }) {
  const s = useStore();
  const rows = data || [];
  if (!rows.length) return <div style={{ ...card, ...centered }}>No projects in this workspace.</div>;
  const cols = '14px minmax(140px,1.8fr) 110px 96px 96px minmax(96px,1fr) 90px';
  return (
    <div style={{ ...card, overflow: 'hidden' }}>
      <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '10px 16px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)', background: 'var(--bg)' }}>
        <span /><span>Project</span><span>Status</span><span>Progress</span><span>Owner</span><span>Tasks</span><span>Last update</span>
      </div>
      {rows.map((p) => {
        const rag = ragMeta[p.st] || ragMeta.mut;
        const last = p.lastStatusUpdate ? new Date(p.lastStatusUpdate).toLocaleDateString() : '—';
        return (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 8, padding: '9px 16px', alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 12 }}>
            <span style={{ width: 9, height: 9, borderRadius: '50%', background: rag.c }} />
            <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
            <span><span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 8px', borderRadius: 99, background: rag.b, color: rag.t, whiteSpace: 'nowrap' }}>{rag.l}</span></span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ flex: 1, height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><span style={{ display: 'block', width: p.prog + '%', height: '100%', background: rag.c }} /></span><span style={{ fontSize: 10, fontWeight: 700, width: 26 }}>{p.prog}%</span></span>
            <span style={{ fontSize: 11, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.members[p.owner]?.n || p.owner}</span>
            <span style={{ fontSize: 11, color: 'var(--txt2)' }}>{p.doneCount}/{p.taskCount}{p.overdueCount > 0 && <span style={{ color: 'var(--bdT)', fontWeight: 700 }}> · {p.overdueCount} overdue</span>}</span>
            <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{last}</span>
          </div>
        );
      })}
    </div>
  );
}

function CfdTab({ data, pid, setPid, projects, selStyle }: {
  data: CfdRow[] | null; pid: string; setPid: (v: string) => void;
  projects: Array<{ id: string; name: string }>; selStyle: React.CSSProperties;
}) {
  if (!projects.length) return <div style={{ ...card, ...centered }}>No projects in this workspace.</div>;
  const rows = data || [];
  const hasData = rows.some((r) => (r.mut + r.prog + r.risk + r.bad + r.done) > 0);
  return (
    <div style={{ ...card, padding: '14px 16px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Cumulative flow</span>
        <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>tasks by status · last 8 weeks</span>
        <select value={pid} onChange={(e) => setPid(e.target.value)} style={{ ...selStyle, marginLeft: 'auto' }}>
          {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      {!hasData
        ? <div style={{ ...centered }}>No task history for this project yet.</div>
        : <CumulativeFlow data={rows} />}
    </div>
  );
}
