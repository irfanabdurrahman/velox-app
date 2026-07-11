import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Hover } from './Hover';
import { stMeta, prMeta, MO, RANGE_END } from '../lib/meta';
import { EP, dayMs, TODAY, fmt, dateOf } from '../lib/dates';

export function CellMenu() {
  const s = useStore();
  const cm = s.cellMenu;
  // local optimistic value while dragging the progress slider (committed on release)
  const [pgLocal, setPgLocal] = useState<number | null>(null);
  useEffect(() => { setPgLocal(null); }, [cm?.tid, cm?.field]);
  if (!cm) return null;
  const ct = s.task(cm.tid);
  if (!ct) return null;
  const setField = (patch: any, toast?: string) => { s.updateTask(cm.tid, patch, toast); s.set({ cellMenu: null }); };

  let body: JSX.Element | null = null;

  if (cm.field === 'st') {
    body = <List>{['mut', 'prog', 'risk', 'bad', 'done'].map((k) => { const m = stMeta(k); const on = ct.st === k; return (
      <Row key={k} on={on} onClick={() => setField({ st: k, pg: k === 'done' ? 100 : ct.pg }, 'Status → ' + m.l)}><span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 9px', borderRadius: 99, background: m.b, color: m.t }}>{m.l}</span></Row>
    ); })}</List>;
  } else if (cm.field === 'av') {
    body = <List>
      <Row on={!ct.a} onClick={() => setField({ a: null })}><span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>Unassigned</span></Row>
      {Object.keys(s.members).slice(0, 10).map((k) => { const on = ct.a === k; return (
        <Row key={k} on={on} onClick={() => setField({ a: k }, 'Assigned to ' + s.members[k].n)}>
          <span style={{ width: 20, height: 20, borderRadius: '50%', background: s.members[k].c, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800, flex: 'none' }}>{k}</span>
          <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>{s.members[k].n}</span>
        </Row>
      ); })}
    </List>;
  } else if (cm.field === 'pr') {
    body = <List>{['urgent', 'high', 'med', 'low'].map((k) => { const m = prMeta(k); const on = ct.pr === k; return (
      <Row key={k} on={on} onClick={() => setField({ pr: k }, 'Priority → ' + m.t)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill={m.c} stroke={m.c} strokeWidth="2" strokeLinecap="round"><path d="M4 21V4" /><path d="M4 4h12l-2.5 4L16 12H4" stroke="none" /></svg>
        <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--txt)' }}>{m.t}</span>
      </Row>
    ); })}</List>;
  } else if (cm.field === 'pg') {
    const pgShown = pgLocal ?? ct.pg;
    const commitPg = () => { if (pgLocal != null) { if (pgLocal !== ct.pg) s.updateTask(cm.tid, { pg: pgLocal }); setPgLocal(null); } };
    body = <div style={{ padding: '8px 10px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, fontWeight: 700, marginBottom: 7 }}><span style={{ color: 'var(--txt3)' }}>Progress</span><span>{pgShown}%</span></div>
      <input type="range" min={0} max={100} step={5} value={pgShown} onChange={(e) => setPgLocal(parseInt(e.target.value, 10))} onPointerUp={commitPg} onMouseUp={commitPg} onKeyUp={commitPg} onBlur={commitPg} style={{ width: 170, accentColor: 'var(--acc)' }} />
    </div>;
  } else {
    // date picker (ds / de) — picks clamp to the project range [0, RANGE_END-1]
    const tdD = dateOf(TODAY);
    const cal = s.cmCal || { y: tdD.getUTCFullYear(), m: tdD.getUTCMonth() };
    const epD = dateOf(0), endD = dateOf(RANGE_END - 1);
    const minIdx = epD.getUTCFullYear() * 12 + epD.getUTCMonth();
    const maxIdx = endD.getUTCFullYear() * 12 + endD.getUTCMonth();
    const calIdx = cal.y * 12 + cal.m;
    const canPrev = calIdx > minIdx, canNext = calIdx < maxIdx;
    const first = Date.UTC(cal.y, cal.m, 1);
    const firstOff = Math.round((first - EP) / dayMs);
    const dowFirst = ((firstOff % 7) + 7) % 7;
    const dim = new Date(Date.UTC(cal.y, cal.m + 1, 0)).getUTCDate();
    const cells: JSX.Element[] = [];
    for (let i = 0; i < dowFirst; i++) cells.push(<span key={'e' + i} />);
    for (let d = 1; d <= dim; d++) {
      const off = firstOff + d - 1;
      const isCur = cm.field === 'ds' ? ct.s === off : ct.e === off;
      const isToday = off === TODAY;
      cells.push(
        <Hover key={d} onClick={() => { const day = Math.max(0, Math.min(RANGE_END - 1, off)); const applied = cm.field === 'ds' ? Math.min(day, ct.e ?? day) : Math.max(day, ct.s ?? day); setField(cm.field === 'ds' ? { s: applied } : { e: applied }, (cm.field === 'ds' ? 'Start' : 'Due') + ' → ' + fmt(applied)); }} style={{ height: 24, display: 'grid', placeItems: 'center', fontSize: 10.5, fontWeight: isCur || isToday ? 800 : 500, color: isCur ? '#fff' : (isToday ? 'var(--accT)' : 'var(--txt)'), background: isCur ? 'var(--acc)' : 'transparent', borderRadius: 7, cursor: 'pointer' }} hover={{ background: isCur ? 'var(--acc)' : 'var(--accS)' }}>{d}</Hover>,
      );
    }
    body = <>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '4px 6px 6px' }}>
        <svg onClick={() => { if (!canPrev) return; s.set((x) => ({ cmCal: { y: x.cmCal.m === 0 ? x.cmCal.y - 1 : x.cmCal.y, m: x.cmCal.m === 0 ? 11 : x.cmCal.m - 1 } })); }} style={{ cursor: canPrev ? 'pointer' : 'default', opacity: canPrev ? 1 : 0.3 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
        <span style={{ fontSize: 12, fontWeight: 700 }}>{MO[cal.m]} {cal.y}</span>
        <svg onClick={() => { if (!canNext) return; s.set((x) => ({ cmCal: { y: x.cmCal.m === 11 ? x.cmCal.y + 1 : x.cmCal.y, m: x.cmCal.m === 11 ? 0 : x.cmCal.m + 1 } })); }} style={{ cursor: canNext ? 'pointer' : 'default', opacity: canNext ? 1 : 0.3 }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,26px)', gap: 1, padding: '0 4px 4px', fontSize: 9, color: 'var(--txt3)', textAlign: 'center', fontWeight: 700 }}>
        <span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span style={{ color: 'var(--wa)' }}>S</span><span style={{ color: 'var(--wa)' }}>S</span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,26px)', gap: 1, padding: '0 4px 6px' }}>{cells}</div>
    </>;
  }

  return (
    <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', left: cm.x, top: cm.y, zIndex: 80, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh3)', padding: 6, animation: 'vpop .14s ease', minWidth: 184 }}>
      {body}
    </div>
  );
}

function List({ children }: { children: any }) { return <>{children}</>; }
function Row({ on, onClick, children }: { on?: boolean; onClick: () => void; children: any }) {
  return (
    <Hover onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6.5px 8px', borderRadius: 8, cursor: 'pointer', background: on ? 'var(--accS)' : 'transparent' }} hover={{ background: 'var(--hover)' }}>
      {children}
      {on && <svg style={{ marginLeft: 'auto' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accT)" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
    </Hover>
  );
}
