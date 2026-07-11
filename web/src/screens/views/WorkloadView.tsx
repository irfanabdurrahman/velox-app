import { useStore } from '../../store';
import { TODAY, dowIdx } from '../../lib/dates';

export function WorkloadView() {
  const s = useStore();
  const wldrag = (s as any).wldrag;

  // real week labels from the store (derived server-side from the live TODAY)
  const wlWeeks = Array.from({ length: 8 }, (_, i) => ({ l: s.workloadWeeks[i] || '', co: i === 0 ? 'var(--accT)' : 'var(--txt3)' }));

  // rows = members of the current workspace that appear in the workload map
  const wlPpl = Array.from(new Set(
    s.memberships.filter((m) => m.ws === s.ws && s.members[m.userId] && s.workload[m.userId]).map((m) => m.userId),
  ));

  const wlRows = wlPpl.map((pid) => {
    const arr = Array.from({ length: 8 }, (_, i) => (s.workload[pid] || [])[i] ?? 0);
    const overN = arr.filter((h) => h > 40).length;
    return {
      id: pid, av: pid, avBg: s.members[pid].c, n: s.members[pid].n,
      sum: overN ? overN + ' weeks over capacity' : 'balanced',
      sumCo: overN ? 'var(--bdT)' : 'var(--okT)',
      cells: arr.map((h, w) => {
        const pct = Math.round((h / 40) * 100);
        const over = h > 40;
        const wkStart = TODAY - dowIdx(TODAY) + w * 7;
        const chipTask = over ? s.tasks.find((t) => t.a === pid && t.s !== null && !t.ms && t.s! <= wkStart + 6 && (t.e ?? t.s)! >= wkStart) : null;
        return {
          h, pct, w: Math.min(100, pct),
          co: over ? 'var(--bdT)' : 'var(--txt3)',
          bar: over ? 'var(--bd)' : pct > 85 ? 'var(--wa)' : 'var(--acc)',
          bg: over ? 'var(--bdB)' : 'transparent',
          hasChip: over,
          chip: chipTask ? chipTask.name : 'rebalance 8h',
          op: wldrag && wldrag.p === pid && wldrag.w === w ? 0.35 : 1,
          oD: (e: React.MouseEvent) => {
            if (e.button !== 0) return;
            e.preventDefault();
            e.stopPropagation();
            s.set({ wldrag: { p: pid, w, h: 8, id: chipTask ? chipTask.id : null, x: e.clientX, y: e.clientY, name: chipTask ? chipTask.name : '8h of work', moved: false } } as any);
          },
        };
      }),
    };
  });

  const wGhostOn = !!(wldrag && wldrag.moved);
  const allZero = wlRows.every((p) => p.cells.every((c) => c.h === 0));
  const anyOver = wlRows.some((p) => p.cells.some((c) => c.hasChip));

  return (
    <div data-screen-label="Workload view" style={{ flex: 1, minHeight: 0, overflow: 'auto', background: 'var(--card)' }}>
      <div style={{ minWidth: 980 }}>
        <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)', display: 'grid', gridTemplateColumns: '190px repeat(8,1fr)', height: 38, alignItems: 'center', borderBottom: '1px solid var(--line)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
          <span style={{ padding: '0 12px' }}>Person · capacity 40h/w</span>
          {wlWeeks.map((w, i) => <span key={i} style={{ textAlign: 'center', color: w.co }}>{w.l}</span>)}
        </div>
        {wlRows.map((p) => (
          <div key={p.id} style={{ display: 'grid', gridTemplateColumns: '190px repeat(8,1fr)', height: 52, alignItems: 'center', borderBottom: '1px solid var(--line2)' }}>
            <span style={{ padding: '0 12px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ width: 24, height: 24, borderRadius: '50%', background: p.avBg, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800 }}>{p.av}</span>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.n}</span>
                <span style={{ display: 'block', fontSize: 9.5, color: p.sumCo, fontWeight: 600 }}>{p.sum}</span>
              </span>
            </span>
            {p.cells.map((c, w) => (
              <span key={w} data-person={p.id} style={{ height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: 3, padding: '0 7px', background: c.bg }}>
                <span style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, fontWeight: 700, color: c.co }}><span>{c.h}h</span><span>{c.pct}%</span></span>
                <span style={{ height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', display: 'block' }}><span style={{ display: 'block', width: `${c.w}%`, height: '100%', background: c.bar, borderRadius: 99 }} /></span>
                {c.hasChip && <span onMouseDown={c.oD} style={{ fontSize: 8.5, fontWeight: 700, background: 'var(--bdB)', color: 'var(--bdT)', borderRadius: 5, padding: '1.5px 5px', cursor: 'grab', whiteSpace: 'nowrap', overflow: 'hidden', display: 'block', opacity: c.op }}>⇄ {c.chip}</span>}
              </span>
            ))}
          </div>
        ))}
        {allZero && <div style={{ padding: '14px 12px', fontSize: 11, color: 'var(--txt3)' }}>Workload is computed from assigned, scheduled tasks</div>}
        {anyOver && <div style={{ padding: '10px 12px', fontSize: 10.5, color: 'var(--txt3)' }}>Drag a red chip onto another person's row to rebalance.</div>}
      </div>
      {wGhostOn && <div style={{ position: 'fixed', left: wldrag.x + 10, top: wldrag.y + 8, zIndex: 99, pointerEvents: 'none', background: 'var(--card)', border: '1.5px solid var(--acc)', borderRadius: 8, padding: '5px 10px', boxShadow: 'var(--sh3)', fontSize: 11, fontWeight: 600 }}>⇄ {wldrag.name}</div>}
    </div>
  );
}
