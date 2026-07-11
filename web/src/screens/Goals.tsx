import { useStore } from '../store';
import { fmt, TODAY, dateOf } from '../lib/dates';

type Kr = { n: string; v: string; dot: string };
type Goal = { tag: string; n: string; pct: number; c: string; co: string; krs: Kr[] };

export function Goals() {
  const s = useStore();
  const td = dateOf(TODAY);
  const title = `Goals — ${td.getUTCMonth() < 6 ? 'H1' : 'H2'} ${td.getUTCFullYear()}`;
  const wsName = s.workspaces.find((w) => w.id === s.ws)?.name || '';

  // one goal per project of the current workspace; progress = project prog,
  // KRs = up to 3 milestone tasks with their done state
  const goalRows: Goal[] = s.projects
    .filter((p) => p.ws === s.ws)
    .map((p, i) => {
      const pct = Math.max(0, Math.min(100, Math.round(p.prog)));
      const risk = p.st === 'risk' || p.st === 'bad';
      const krs: Kr[] = s.tasks
        .filter((t) => t.pid === p.id && t.ms)
        .slice(0, 3)
        .map((m) => ({
          n: m.name,
          v: m.st === 'done' ? 'Done' : m.e != null ? 'due ' + fmt(m.e) : '—',
          dot: m.st === 'done' ? 'var(--ok)' : m.e != null && m.e < TODAY ? 'var(--wa)' : 'var(--in)',
        }));
      return {
        tag: 'O' + (i + 1), n: p.name, pct,
        c: risk ? 'var(--wa)' : pct >= 70 ? 'var(--ok)' : 'var(--acc)',
        co: risk ? 'var(--waT)' : pct >= 70 ? 'var(--okT)' : 'var(--accT)',
        krs,
      };
    });

  return (
    <div data-screen-label="Goals" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</span>
          <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{wsName ? wsName + ' — one goal per project' : 'One goal per project'}</span>
        </div>
        {goalRows.map((g) => (
          <div key={g.tag} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 17px', marginBottom: 10, boxShadow: 'var(--sh1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '2px 9px' }}>{g.tag}</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{g.n}</span>
              <span style={{ fontSize: 12, fontWeight: 800, color: g.co }}>{g.pct}%</span>
            </div>
            <div style={{ height: 7, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginBottom: g.krs.length ? 10 : 0 }}>
              <div style={{ width: `${g.pct}%`, height: '100%', background: g.c, borderRadius: 99 }} />
            </div>
            {g.krs.map((k, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0', fontSize: 12, color: 'var(--txt2)' }}>
                <span style={{ width: 6, height: 6, borderRadius: '50%', background: k.dot, flex: 'none' }} />
                <span style={{ flex: 1 }}>{k.n}</span>
                <span style={{ fontWeight: 700, color: 'var(--txt)' }}>{k.v}</span>
              </div>
            ))}
          </div>
        ))}
        {goalRows.length === 0 && (
          <div style={{ textAlign: 'center', padding: '44px 0' }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No goals yet</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Create a project and its progress will roll up here as a goal.</div>
          </div>
        )}
      </div>
    </div>
  );
}
