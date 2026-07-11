import { useState } from 'react';
import { useStore } from '../../store';
import { MO } from '../../lib/meta';
import { EP, TODAY, dayMs, dateOf } from '../../lib/dates';

const CHIP_C: Record<string, [string, string, string]> = {
  done: ['var(--okB)', 'var(--okT)', 'var(--ok)'],
  prog: ['var(--inB)', 'var(--inT)', 'var(--in)'],
  risk: ['var(--waB)', 'var(--waT)', 'var(--wa)'],
  bad: ['var(--bdB)', 'var(--bdT)', 'var(--bd)'],
  mut: ['var(--muB)', 'var(--muT)', 'var(--txt3)'],
};

export function CalendarView() {
  const s = useStore();
  const projTasks = s.tasks.filter((t) => t.pid === s.projectId);
  const cdrag = (s as any).cdrag;

  // ===== month grid — seeded from the real TODAY, free to cross year bounds =====
  const tdDate = dateOf(TODAY);
  const [cal, setCal] = useState({ y: tdDate.getUTCFullYear(), m: tdDate.getUTCMonth() });
  const y = cal.y, m = cal.m;
  const firstOff = Math.round((Date.UTC(y, m, 1) - EP) / dayMs);
  const dowFirst = ((firstOff % 7) + 7) % 7;
  const dim = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const start = firstOff - dowFirst;
  const cells = Math.ceil((dowFirst + dim) / 7) * 7;

  const calCells = [];
  for (let i = 0; i < cells; i++) {
    const off = start + i;
    const dt = new Date(EP + off * dayMs);
    const inM = dt.getUTCMonth() === m;
    const isT = off === TODAY;
    const wk = i % 7 >= 5;
    const chips = projTasks
      .filter((t) => t.s !== null && t.s === off && !projTasks.some((x) => x.par === t.id) && !t.ms)
      .map((t) => {
        const c = CHIP_C[t.st] || CHIP_C.mut;
        const overdue = t.e != null && t.e < TODAY && t.st !== 'done';
        return {
          id: t.id, n: t.name, bgc: c[0], co: c[1], bar: overdue ? 'var(--bd)' : c[2],
          op: cdrag && cdrag.id === t.id ? 0.35 : 1,
          oD: (e: React.MouseEvent) => { if (e.button !== 0) return; e.preventDefault(); s.set({ cdrag: { id: t.id, x: e.clientX, y: e.clientY, name: t.name, moved: false } } as any); },
          oOpen: () => s.openTask(t.id),
        };
      });
    const msChips = projTasks
      .filter((t) => t.ms && t.e === off)
      .map((t) => ({
        id: t.id, n: '◆ ' + t.name, bgc: 'var(--accS)', co: 'var(--accT)', bar: 'var(--msC)', op: 1,
        oD: (_e: React.MouseEvent) => {}, oOpen: () => s.openTask(t.id),
      }));
    calCells.push({
      off, n: dt.getUTCDate(), fw: isT ? '800' : '600',
      co: isT ? '#fff' : inM ? 'var(--txt)' : 'var(--txt3)',
      pill: isT ? 'var(--acc)' : 'transparent',
      bg: wk ? 'var(--wknd)' : inM ? 'transparent' : 'var(--bg)',
      chips: chips.concat(msChips),
    });
  }

  const calTray = projTasks.filter((t) => t.s === null).map((t) => ({
    id: t.id, n: t.name,
    meta: 'No date · ' + (t.a && s.members[t.a] ? s.members[t.a].n : 'Unassigned'),
    op: cdrag && cdrag.id === t.id ? 0.35 : 1,
    oD: (e: React.MouseEvent) => { if (e.button !== 0) return; e.preventDefault(); s.set({ cdrag: { id: t.id, x: e.clientX, y: e.clientY, name: t.name, moved: false, fromTray: true } } as any); },
  }));

  const calTitle = MO[m] + ' ' + y;
  const calPrev = () => setCal((c) => (c.m === 0 ? { y: c.y - 1, m: 11 } : { y: c.y, m: c.m - 1 }));
  const calNext = () => setCal((c) => (c.m === 11 ? { y: c.y + 1, m: 0 } : { y: c.y, m: c.m + 1 }));
  const calToday = () => setCal({ y: tdDate.getUTCFullYear(), m: tdDate.getUTCMonth() });

  const cGhostOn = !!(cdrag && cdrag.moved);

  return (
    <div data-screen-label="Calendar view" style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--card)' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px' }}>
          <svg onClick={calPrev} style={{ cursor: 'pointer' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M15 18l-6-6 6-6" /></svg>
          <span style={{ fontSize: 14, fontWeight: 800, minWidth: 130, textAlign: 'center' }}>{calTitle}</span>
          <svg onClick={calNext} style={{ cursor: 'pointer' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
          <span onClick={calToday} style={{ fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 7, padding: '4px 10px', cursor: 'pointer' }}>Today</span>
          <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--txt3)' }}>Drag a chip to reschedule · drag from the tray to plan</span>
        </div>
        <div style={{ flex: 'none', display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderTop: '1px solid var(--line)', borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
          {(['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN'] as const).map((d, i) => (
            <span key={d} style={{ padding: '5px 8px', fontSize: 9.5, fontWeight: 800, color: i >= 5 ? 'var(--wa)' : 'var(--txt3)', letterSpacing: '.06em' }}>{d}</span>
          ))}
        </div>
        <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridAutoRows: '1fr', overflowY: 'auto' }}>
          {calCells.map((d) => (
            <div key={d.off} data-day={d.off} style={{ borderRight: '1px solid var(--line2)', borderBottom: '1px solid var(--line2)', padding: '5px 6px', minHeight: 86, background: d.bg, position: 'relative' }}>
              <span style={{ fontSize: 10.5, fontWeight: d.fw as any, color: d.co, background: d.pill, borderRadius: 99, padding: '1px 6px' }}>{d.n}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                {d.chips.map((c, ci) => (
                  <div key={c.id + '_' + ci} onMouseDown={c.oD} onDoubleClick={c.oOpen} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 600, background: c.bgc, color: c.co, borderLeft: `3px solid ${c.bar}`, borderRadius: 6, padding: '3px 6px', cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', opacity: c.op }}>{c.n}</div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
      <div style={{ width: 224, flex: 'none', borderLeft: '1px solid var(--line)', background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '12px 13px 6px', fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Unscheduled</div>
        <div style={{ padding: '0 13px 8px', fontSize: 10.5, color: 'var(--txt3)', lineHeight: 1.4 }}>Drag onto a date to schedule</div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '0 10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
          {calTray.map((c) => (
            <div key={c.id} onMouseDown={c.oD} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '8px 10px', cursor: 'grab', boxShadow: 'var(--sh1)', opacity: c.op }}>
              <div style={{ fontSize: 11.5, fontWeight: 600, marginBottom: 3 }}>{c.n}</div>
              <div style={{ fontSize: 9.5, color: 'var(--txt3)' }}>{c.meta}</div>
            </div>
          ))}
          {calTray.length === 0 && <div style={{ border: '1.5px dashed var(--line)', borderRadius: 10, padding: 14, textAlign: 'center', fontSize: 10.5, color: 'var(--txt3)' }}>All scheduled 🎯</div>}
        </div>
      </div>
      {cGhostOn && <div style={{ position: 'fixed', left: cdrag.x + 10, top: cdrag.y + 8, zIndex: 99, pointerEvents: 'none', background: 'var(--card)', border: '1.5px solid var(--acc)', borderRadius: 8, padding: '5px 10px', boxShadow: 'var(--sh3)', fontSize: 11, fontWeight: 600 }}>{cdrag.name}</div>}
    </div>
  );
}
