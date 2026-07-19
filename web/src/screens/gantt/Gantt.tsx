import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { canvasRef, scrollerRef } from '../../lib/refs';
import { buildTimeline, visRows, effDates } from '../../lib/gantt';
import { stMeta, prMeta, dotFor, stBar, rowHFor, barHFor } from '../../lib/meta';
import { fmt, TODAY, dateOf } from '../../lib/dates';
import { Hover } from '../../components/Hover';


// Grid geometry: phones get a narrow Task/Who/Status table so the timeline and
// the collapse chevron stay on-screen; other fields live in the slide-over.
const mobGridW = () => Math.min(window.innerWidth - 84, 330);
const gridColsFor = (mob: boolean, extra: boolean) =>
  mob ? `${mobGridW() - 150}px 34px 92px 24px` : '252px 34px 92px 30px 62px 62px 40px' + (extra ? ' 84px' : '') + ' 24px';

export function Gantt() {
  const s = useStore();
  // tablet polish: the left grid can collapse to a narrow strip so the timeline
  // gets the space. Purely local UI state; defaults open, auto-collapses on small screens.
  const [gridCollapsed, setGridCollapsed] = useState(false);
  const { ppd, months, subs, canvasBg, monthLines, cw } = buildTimeline(s.zoom);
  const rh = rowHFor(s.density);
  const bh = barHFor(s.density);
  const rowsArr = visRows(s.tasks, s.projectId, s.collapsed, s.statusFilter);
  const rowsH = Math.max((rowsArr.length + 1) * rh, 420);
  // the extra column now shows the project's FIRST custom field (honest data, no fabricated cost)
  const projCF = s.customFields.find((f) => f.pid === s.projectId) || null;
  const gw = gridCollapsed ? 46 : s.mobile ? mobGridW() : 596 + (s.extraCol ? 84 : 0);
  const gridCols = gridColsFor(s.mobile, s.extraCol);
  const todayX = Math.round((TODAY + 0.5) * ppd);

  // scroll to today on mount; on zoom change keep the date under the viewport's left edge anchored
  const prevPpdRef = useRef<number | null>(null);
  useEffect(() => {
    const sc = scrollerRef.current;
    const oldPpd = prevPpdRef.current;
    prevPpdRef.current = ppd;
    if (!sc) return;
    if (oldPpd == null) sc.scrollLeft = Math.max(0, (TODAY + 0.5) * ppd - 260);
    else if (oldPpd !== ppd) sc.scrollLeft = (sc.scrollLeft / oldPpd) * ppd;
  }, [ppd]);

  // on narrow (tablet) viewports, start with the grid collapsed
  useEffect(() => {
    if (window.innerWidth < 1100) setGridCollapsed(true);
    if (window.innerWidth < 760 && useStore.getState().zoom === 'day') useStore.getState().setZoom('week');
  }, []);

  if (rowsArr.length === 0) return <GanttEmpty />;

  // ---- build bars (mirrors core()) ----
  const pos: Record<string, { l: number; r: number; cy: number }> = {};
  const sumBars: any[] = [], taskBars: any[] = [], msBars: any[] = [], ghostBars: any[] = [], baseGhosts: any[] = [];
  rowsArr.forEach((rw, i) => {
    const t = rw.t;
    const eff = effDates(t, s.drag, s.pend);
    const top = i * rh, left = eff.s * ppd, w = (eff.e - eff.s + 1) * ppd;
    const dragging = (s.drag && s.drag.id === t.id) || (s.pend && s.pend.id === t.id);
    const critOn = s.criticalOn && t.crit;
    const shBase = critOn ? '0 0 0 1.5px var(--bd)' : 'var(--sh1)';
    if (dragging && ((s.drag && s.drag.moved) || s.pend))
      ghostBars.push({ top: top + (rh - (t.ms ? 16 : (rw.hasKids ? 11 : bh))) / 2, left: (t.s ?? 0) * ppd, w: t.ms ? 16 : ((t.e ?? 0) - (t.s ?? 0) + 1) * ppd, h: t.ms ? 16 : (rw.hasKids ? 11 : bh) });
    if (s.baselineOn && t.bs != null && t.be != null && !rw.hasKids && !t.ms)
      baseGhosts.push({ top: top + (rh + bh) / 2 + 1, left: t.bs * ppd, w: (t.be - t.bs + 1) * ppd });
    if (t.ms) {
      const cx = left + ppd / 2;
      pos[t.id] = { l: cx - 8, r: cx + 8, cy: top + rh / 2 };
      msBars.push({ id: t.id, top: top + (rh - 14) / 2, left: cx - 7, label: t.name, dTxt: fmt(eff.s), sh: critOn ? '0 0 0 1.5px var(--bd),var(--sh1)' : 'var(--sh1)' });
      return;
    }
    if (rw.hasKids && !t.a) {
      pos[t.id] = { l: left, r: left + w, cy: top + rh / 2 };
      sumBars.push({ id: t.id, top: top + (rh - 11) / 2, left, w, op: dragging ? 0.92 : 1 });
      return;
    }
    pos[t.id] = { l: left, r: left + w, cy: top + rh / 2 };
    const c = stBar[t.st] || stBar.mut;
    const sel = s.selId === t.id;
    const done = t.st === 'done';
    taskBars.push({
      id: t.id, top: top + (rh - bh) / 2, left, w, h: bh, bg: c.bg, fill: c.fill,
      fw: done ? w : Math.round(w * t.pg / 100), lc: c.lc, ts: c.ts,
      label: t.name + (t.pg > 0 && !done ? ' · ' + t.pg + '%' : ''),
      hasAv: !!t.a && w > 60, av: t.a || '', avBg: t.a ? (s.members[t.a]?.c || 'var(--txt3)') : 'transparent',
      sh: sel ? '0 0 0 2px var(--acc),0 6px 16px var(--ring)' : shBase, z: sel ? 3 : 2,
      sel: sel && !s.drag, showDots: s.hovId === t.id && !sel && !s.drag && !s.depDraw,
    });
  });

  // deps
  const deps: any[] = [];
  rowsArr.forEach((rw) => {
    const t = rw.t;
    t.deps.forEach((dp) => {
      const a = pos[dp.t], b = pos[t.id];
      if (!a || !b) return;
      const crit = s.criticalOn && dp.crit;
      const x1 = a.r, y1 = a.cy, x2 = b.l - 2, y2 = b.cy, o = 9;
      let p: string;
      if (x2 >= x1 + o * 2) p = `M${x1} ${y1} L${x1 + o} ${y1} L${x1 + o} ${y2} L${x2} ${y2}`;
      else { const yb = y2 > y1 ? y1 + rh / 2 : y1 - rh / 2; p = `M${x1} ${y1} L${x1 + o} ${y1} L${x1 + o} ${yb} L${x2 - o} ${yb} L${x2 - o} ${y2} L${x2} ${y2}`; }
      // label the link type near the arrowhead, but only when it's not the default FS (avoid clutter)
      const typ = dp.type && dp.type !== 'FS' ? dp.type : '';
      deps.push({ p, ap: `M${x2 + 2} ${y2} l-6 -4 v8 z`, st: crit ? 'var(--bd)' : 'var(--txt3)', da: dp.crit ? 'none' : '3 3', op: crit ? 0.95 : 0.7, typ, tx: x2 - 7, ty: y2 - 5 });
    });
  });

  // dep temp line
  let depTempOn = false, depTempP = '', depTempX = 0, depTempY = 0;
  if (s.depDraw && s.depDraw.x !== undefined) {
    const a = pos[s.depDraw.from];
    if (a) { depTempOn = true; const x1 = s.depDraw.side === 'l' ? a.l : a.r; depTempP = `M${x1} ${a.cy} C ${x1 + 40} ${a.cy} ${s.depDraw.x - 40} ${s.depDraw.y} ${s.depDraw.x} ${s.depDraw.y}`; depTempX = s.depDraw.x; depTempY = s.depDraw.y; }
  }

  // drag tooltip
  let dragTipOn = false, dragTipX = 0, dragTipY = 0, dragTipTxt = '', dragTipDelta = '';
  if (s.drag && s.drag.moved) {
    const t = s.task(s.drag.id);
    if (t) { const eff = effDates(t, s.drag, s.pend); const i = rowsArr.findIndex((x) => x.t.id === t.id); dragTipOn = true; dragTipX = Math.max(4, eff.s * ppd); dragTipY = Math.max(2, i * rh - 26); dragTipTxt = fmt(eff.s) + ' → ' + fmt(eff.e); dragTipDelta = s.drag.dd > 0 ? '+' + s.drag.dd + 'd' : s.drag.dd + 'd'; }
  }

  const pp = s.pp;
  const ppTask = pp ? s.task(pp.id) : null;
  const ppKidNames = ppTask ? s.desc(pp.id).slice(0, 3).map((k) => k.name).join(', ') : '';

  const barDown = (id: string, mode: string, e: React.MouseEvent) => { if (e.button !== 0) return; e.stopPropagation(); e.preventDefault(); s.set({ drag: { id, mode, x0: e.clientX, dd: 0, moved: false }, cellMenu: null, pp: null, pend: null }); };
  const dotDown = (id: string, side: string, e: React.MouseEvent) => { e.stopPropagation(); e.preventDefault(); const c = canvasRef.current; const r = c ? c.getBoundingClientRect() : { left: 0, top: 0 } as DOMRect; s.set({ depDraw: { from: id, side, x: e.clientX - r.left, y: e.clientY - r.top } }); };

  // chevron pill straddling the grid/timeline boundary — collapses/expands the left grid
  const toggleBtn = (
    <Hover as="button" onClick={(e: any) => { e.stopPropagation(); setGridCollapsed((v) => !v); }} onMouseDown={(e: any) => e.stopPropagation()} title={gridCollapsed ? 'Expand table' : 'Collapse table'} style={{ position: 'absolute', top: 10, right: -11, zIndex: 12, width: 22, height: 22, borderRadius: '50%', background: 'var(--card)', border: '1px solid var(--line)', boxShadow: 'var(--sh1)', display: 'grid', placeItems: 'center', color: 'var(--txt2)' }} hover={{ background: 'var(--hover)', borderColor: 'var(--acc)' }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ transform: gridCollapsed ? 'none' : 'rotate(180deg)' }}><path d="M9 6l6 6-6 6" /></svg>
    </Hover>
  );

  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', background: 'var(--card)' }}>
      <div ref={scrollerRef} style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
        <div style={{ display: 'flex', minWidth: 'max-content', position: 'relative' }}>
          {/* LEFT GRID */}
          <div style={{ position: 'sticky', left: 0, zIndex: 10, background: 'var(--card)', width: gw, flex: 'none', boxShadow: '2px 0 0 var(--line)' }}>
            {gridCollapsed ? (
              <>
                <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)', height: 44, borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'flex-end', padding: '0 8px 8px', fontSize: 9, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  Task
                  {toggleBtn}
                </div>
                {rowsArr.map((rw) => {
                  const t = rw.t, sel = s.selId === t.id;
                  return (
                    <Hover key={t.id} onMouseEnter={() => s.set({ hovId: t.id })} onMouseLeave={() => s.set((x) => (x.hovId === t.id ? { hovId: null } : {}))} onClick={() => s.set({ selId: t.id })} onDoubleClick={() => s.openTask(t.id)} title={t.name} style={{ display: 'flex', alignItems: 'center', gap: 5, height: rh, borderBottom: '1px solid var(--line2)', padding: `0 6px 0 ${6 + Math.min(rw.lvl, 3) * 5}px`, background: sel ? 'var(--accS)' : (rw.hasKids ? 'var(--bg)' : 'transparent'), cursor: 'pointer', position: 'relative', overflow: 'hidden' }} hover={{ background: sel ? 'var(--accS)' : 'var(--hover)' }}>
                      {s.criticalOn && t.crit && <span style={{ position: 'absolute', left: 0, top: 5, bottom: 5, width: 2.5, background: 'var(--bd)', borderRadius: 2 }} />}
                      {t.ms
                        ? <span style={{ width: 8, height: 8, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 2, flex: 'none' }} />
                        : <span style={{ width: 7, height: 7, borderRadius: '50%', background: rw.hasKids ? 'var(--txt2)' : dotFor(t.st === 'ok' ? 'ok' : t.st), flex: 'none' }} />}
                      <span style={{ fontSize: 11, fontWeight: rw.hasKids ? 700 : 500, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.name}</span>
                    </Hover>
                  );
                })}
                <Hover onClick={() => setGridCollapsed(false)} title="Expand table to add tasks" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: rh, borderBottom: '1px solid var(--line2)', color: 'var(--txt3)', cursor: 'pointer', fontSize: 15 }} hover={{ background: 'var(--hover)', color: 'var(--acc)' }}>＋</Hover>
              </>
            ) : (
              <>
                <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)', display: 'grid', gridTemplateColumns: gridCols, height: 44, alignItems: 'end', borderBottom: '1px solid var(--line)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
                  <span style={{ padding: '7px 10px', borderRight: '1px solid var(--line2)' }}>Task</span>
                  <span style={{ padding: '7px 5px', borderRight: '1px solid var(--line2)' }}>Who</span>
                  <span style={{ padding: '7px 8px', borderRight: '1px solid var(--line2)' }}>Status</span>
                  {!s.mobile && <><span style={{ padding: '7px 6px', borderRight: '1px solid var(--line2)' }} title="Priority">Pri</span>
                  <span style={{ padding: '7px 8px', borderRight: '1px solid var(--line2)' }}>Start</span>
                  <span style={{ padding: '7px 8px', borderRight: '1px solid var(--line2)' }}>Due</span>
                  <span style={{ padding: '7px 8px', borderRight: '1px solid var(--line2)' }}>%</span>
                  {s.extraCol && <span style={{ padding: '7px 8px', borderRight: '1px solid var(--line2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={projCF ? projCF.name : 'Custom field'}>{projCF ? projCF.name : 'Custom'}</span>}
                  <span onClick={(e) => { e.stopPropagation(); const turningOn = !s.extraCol; s.set((x) => ({ extraCol: !x.extraCol })); s.pushToast(turningOn ? (projCF ? `Column added: ${projCF.name}` : 'Column added — this project has no custom fields yet') : 'Column removed'); }} onMouseDown={(e) => e.stopPropagation()} style={{ padding: '7px 8px', cursor: 'pointer', color: 'var(--txt3)', fontSize: 12 }} title="Toggle custom-field column">＋</span></>}
                  {toggleBtn}
                </div>
                {rowsArr.map((rw, i) => <GridRow key={rw.t.id} rw={rw} i={i} rh={rh} rowsArr={rowsArr} cfId={projCF ? projCF.id : null} />)}
                <div style={{ display: 'flex', alignItems: 'center', height: rh, borderBottom: '1px solid var(--line2)' }}>
                  <input value={s.addDraft} onChange={(e) => s.set({ addDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && s.addDraft.trim()) { const nm = s.addDraft.trim(); s.set({ addDraft: '' }); s.addTask(nm, undefined, null, TODAY); s.pushToast(s.statusFilter && !s.statusFilter.mut ? 'Task added — clear the status filter to see it' : 'Task added — drag it on the timeline to schedule'); } }} placeholder="＋ Add task — type a name, press Enter" style={{ flex: 1, border: 'none', background: 'transparent', padding: '0 12px', fontSize: 13, color: 'var(--txt)', height: '100%' }} />
                </div>
              </>
            )}
          </div>

          {/* TIMELINE */}
          <div style={{ flex: 'none', width: cw, position: 'relative' }}>
            <div style={{ position: 'sticky', top: 0, zIndex: 2, background: 'var(--bg)', borderBottom: '1px solid var(--line)' }}>
              <div style={{ position: 'relative', height: 19 }}>
                {months.map((m, k) => <span key={k} style={{ position: 'absolute', left: m.x, width: m.w, top: 0, height: 19, display: 'flex', alignItems: 'center', padding: '0 7px', fontSize: 11, fontWeight: 700, color: 'var(--txt)', borderRight: '1px solid var(--line2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{m.label}</span>)}
                {monthLines.map((ml, k) => <span key={k} style={{ position: 'absolute', top: 0, bottom: 0, left: ml.x, width: 1.5, background: 'var(--txt3)', opacity: 0.55 }} />)}
              </div>
              <div style={{ position: 'relative', height: 25 }}>
                {subs.map((d, k) => (
                  <span key={k} style={{ position: 'absolute', left: d.x, width: d.w, top: 0, height: 25, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: d.bg, borderRight: '1px solid var(--line2)' }}>
                    <span style={{ fontSize: 8.5, fontWeight: 700, color: d.c1, lineHeight: 1 }}>{d.l1}</span>
                    <span style={{ fontSize: 10.5, fontWeight: d.fw2 as any, color: d.c2, lineHeight: 1.25, background: d.pill, borderRadius: 99, padding: '0 4px' }}>{d.l2}</span>
                  </span>
                ))}
                {monthLines.map((ml, k) => <span key={k} style={{ position: 'absolute', top: 0, bottom: 0, left: ml.x, width: 1.5, background: 'var(--txt3)', opacity: 0.55 }} />)}
              </div>
            </div>
            <div ref={canvasRef} onMouseDown={() => s.set({ selId: null, cellMenu: null })} style={{ position: 'relative', height: rowsH, background: canvasBg }}>
              {monthLines.map((ml, k) => <span key={k} style={{ position: 'absolute', top: 0, bottom: 0, left: ml.x, width: 1.5, background: 'var(--txt3)', opacity: 0.45, zIndex: 1, pointerEvents: 'none' }} />)}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 2, background: 'var(--tdy)', zIndex: 5, pointerEvents: 'none' }}>
                <span style={{ position: 'absolute', top: 3, left: -17, fontSize: 8, fontWeight: 800, color: '#fff', background: 'var(--tdy)', borderRadius: 4, padding: '1.5px 5px', letterSpacing: '.04em' }}>TODAY</span>
              </div>
              {baseGhosts.map((g, k) => <div key={k} title="Baseline" style={{ position: 'absolute', top: g.top, left: g.left, width: g.w, height: 7, border: '1.5px dashed var(--txt3)', borderRadius: 4, opacity: 0.65, zIndex: 1 }} />)}
              <svg width={cw} height={rowsH} style={{ position: 'absolute', inset: 0, zIndex: 3, pointerEvents: 'none' }}>
                {deps.map((d, k) => <g key={k}><path d={d.p} fill="none" stroke={d.st} strokeWidth="1.5" strokeDasharray={d.da} opacity={d.op} /><path d={d.ap} fill={d.st} opacity={d.op} />{d.typ && <text x={d.tx} y={d.ty} textAnchor="middle" fontSize="7.5" fontWeight="800" fill={d.st} paintOrder="stroke" stroke="var(--card)" strokeWidth="2.5" style={{ letterSpacing: '.03em' }}>{d.typ}</text>}</g>)}
                {depTempOn && <><path d={depTempP} fill="none" stroke="var(--acc)" strokeWidth="1.8" strokeDasharray="5 4" /><circle cx={depTempX} cy={depTempY} r="4" fill="var(--acc)" /></>}
              </svg>
              {sumBars.map((b) => (
                <div key={b.id} onMouseDown={(e) => barDown(b.id, 'move', e)} onDoubleClick={() => s.openTask(b.id)} style={{ position: 'absolute', top: b.top, left: b.left, width: b.w, height: 11, cursor: 'grab', zIndex: 2 }}>
                  <div style={{ position: 'absolute', inset: 0, background: 'var(--sum)', borderRadius: 3, opacity: b.op }} />
                  <div style={{ position: 'absolute', left: 0, bottom: -4, width: 3, height: 8, background: 'var(--sum)', opacity: b.op }} />
                  <div style={{ position: 'absolute', right: 0, bottom: -4, width: 3, height: 8, background: 'var(--sum)', opacity: b.op }} />
                </div>
              ))}
              {ghostBars.map((g, k) => <div key={k} style={{ position: 'absolute', top: g.top, left: g.left, width: g.w, height: g.h, border: '1.5px dashed var(--txt3)', borderRadius: 6, zIndex: 1, opacity: 0.7 }} />)}
              {taskBars.map((b) => (
                <div key={b.id} onMouseDown={(e) => barDown(b.id, 'move', e)} onDoubleClick={() => s.openTask(b.id)} onMouseEnter={() => s.set({ hovId: b.id })} onMouseLeave={() => s.set((x) => (x.hovId === b.id ? { hovId: null } : {}))} style={{ position: 'absolute', top: b.top, left: b.left, width: b.w, height: b.h, borderRadius: 6, background: b.bg, boxShadow: b.sh, cursor: 'grab', zIndex: b.z }}>
                  <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: b.fw, background: b.fill, borderRadius: '6px 0 0 6px', maxWidth: '100%' }} />
                  <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '0 7px', overflow: 'hidden', pointerEvents: 'none' }}>
                    {b.hasAv && <span style={{ width: 14, height: 14, borderRadius: '50%', background: b.avBg, color: '#fff', fontSize: 6.5, fontWeight: 800, display: 'grid', placeItems: 'center', flex: 'none', border: '1px solid rgba(255,255,255,.5)' }}>{b.av}</span>}
                    <span style={{ fontSize: 11, fontWeight: 600, color: b.lc, whiteSpace: 'nowrap', textShadow: b.ts }}>{b.label}</span>
                  </div>
                  {b.showDots && <>
                    <span onMouseDown={(e) => dotDown(b.id, 'l', e)} title="Draw dependency" style={{ position: 'absolute', left: -6, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: 'var(--card)', border: '1.5px solid var(--acc)', cursor: 'crosshair', zIndex: 4, boxShadow: 'var(--sh1)' }} />
                    <span onMouseDown={(e) => dotDown(b.id, 'r', e)} title="Draw dependency" style={{ position: 'absolute', right: -6, top: '50%', transform: 'translateY(-50%)', width: 10, height: 10, borderRadius: '50%', background: 'var(--card)', border: '1.5px solid var(--acc)', cursor: 'crosshair', zIndex: 4, boxShadow: 'var(--sh1)' }} />
                  </>}
                  {b.sel && <>
                    <span onMouseDown={(e) => barDown(b.id, 'l', e)} style={{ position: 'absolute', left: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 14, borderRadius: 3, background: 'var(--card)', border: '1.5px solid var(--acc)', cursor: 'ew-resize', zIndex: 4 }} />
                    <span onMouseDown={(e) => barDown(b.id, 'r', e)} style={{ position: 'absolute', right: -4, top: '50%', transform: 'translateY(-50%)', width: 8, height: 14, borderRadius: 3, background: 'var(--card)', border: '1.5px solid var(--acc)', cursor: 'ew-resize', zIndex: 4 }} />
                  </>}
                </div>
              ))}
              {msBars.map((b) => (
                <div key={b.id} onMouseDown={(e) => barDown(b.id, 'move', e)} onDoubleClick={() => s.openTask(b.id)} style={{ position: 'absolute', top: b.top, left: b.left, zIndex: 2, cursor: 'grab', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 14, height: 14, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 3, boxShadow: b.sh, flex: 'none' }} />
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', whiteSpace: 'nowrap' }}>{b.label} · {b.dTxt}</span>
                </div>
              ))}
              {dragTipOn && <div style={{ position: 'absolute', top: dragTipY, left: dragTipX, zIndex: 8, background: '#18181B', color: '#fff', fontSize: 10, borderRadius: 7, padding: '4.5px 9px', boxShadow: 'var(--sh2)', whiteSpace: 'nowrap', pointerEvents: 'none', fontWeight: 600 }}>{dragTipTxt} <span style={{ color: '#A5B4FC', fontWeight: 700 }}>{dragTipDelta}</span></div>}
              {pp && (
                <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: pp.y, left: pp.x, zIndex: 9, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 13, boxShadow: 'var(--sh3)', padding: '13px 14px', width: 262, animation: 'vpop .18s ease' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 3 }}>Move {pp.n} subtasks with it?</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt2)', lineHeight: 1.45, marginBottom: 10 }}>{ppKidNames}{pp.n > 3 ? '…' : ''} will shift {pp.dd > 0 ? '+' : ''}{pp.dd} days.</div>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 9 }}>
                    <span onClick={() => { ppApply(true); }} style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', boxShadow: '0 1px 3px var(--ring)' }}>Move together</span>
                    <span onClick={() => { ppApply(false); }} style={{ fontSize: 11, fontWeight: 600, color: 'var(--txt2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 11px', cursor: 'pointer', background: 'var(--card)' }}>Keep subtasks in place</span>
                  </div>
                  <div onClick={() => s.set((x) => ({ ppRemOn: !x.ppRemOn }))} style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 10.5, color: 'var(--txt2)', cursor: 'pointer' }}>
                    <span style={{ width: 13, height: 13, border: `1.5px solid ${s.ppRemOn ? 'var(--acc)' : 'var(--txt3)'}`, background: s.ppRemOn ? 'var(--acc)' : 'transparent', borderRadius: 4, display: 'grid', placeItems: 'center', flex: 'none' }}>{s.ppRemOn && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>}</span>
                    Remember my choice
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  function ppApply(together: boolean) {
    const cur = useStore.getState();
    const pp2 = cur.pp;
    if (!pp2) return;
    const ids = new Set([pp2.id]);
    if (together) cur.desc(pp2.id).forEach((k) => ids.add(k.id));
    const changed: any[] = [];
    const tasks = cur.tasks.map((t) => { if (!ids.has(t.id) || t.s == null || t.e == null) return t; const ns = t.s + pp2.dd, ne = t.e + pp2.dd; changed.push({ id: t.id, s: ns, e: ne }); return { ...t, s: ns, e: ne }; });
    cur.set({ tasks, pp: null, pend: null, parentPref: cur.ppRemOn ? (together ? 'together' : 'keep') : 'ask' });
    changed.forEach((c) => import('../../api').then(({ api }) => api.updateTask(c.id, { s: c.s, e: c.e }).catch(() => {})));
    cur.pushToast(together ? `Moved parent + ${pp2.n} subtasks ${pp2.dd > 0 ? '+' : ''}${pp2.dd}d` : 'Moved parent only — subtasks kept in place');
  }
}

function GanttEmpty() {
  const s = useStore();
  return (
    <div style={{ flex: 1, minHeight: 0, position: 'relative', background: 'var(--card)' }}>
      <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center' }}>
        <div style={{ textAlign: 'center', maxWidth: 340 }}>
          <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--accS)', display: 'grid', placeItems: 'center', margin: '0 auto 14px' }}><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accT)" strokeWidth="2" strokeLinecap="round"><path d="M3 5h8M3 10h13M3 15h6M3 20h10" /></svg></div>
          <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 5 }}>Timeline kosong</div>
          <div style={{ fontSize: 12.5, color: 'var(--txt2)', lineHeight: 1.5, marginBottom: 14 }}>Belum ada task di proyek ini. Tambahkan task pertama, atau minta Velox AI menyusun rencananya.</div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <span onClick={() => { s.addTask('New task', undefined, null, TODAY); if (s.statusFilter && !s.statusFilter.mut) s.pushToast('Task added — clear the status filter to see it'); }} style={{ fontSize: 12, fontWeight: 600, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>＋ Add first task</span>
            <span onClick={() => s.set((x) => ({ aiPanel: !x.aiPanel }))} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>✦ Ask Velox AI</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function fmtCfVal(v: any): string {
  if (v == null || v === '') return '—';
  if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
}

function GridRow({ rw, i, rh, rowsArr, cfId }: { rw: any; i: number; rh: number; rowsArr: any[]; cfId: string | null }) {
  const s = useStore();
  const t = rw.t;
  const editRef = useRef<HTMLInputElement>(null);
  const st = stMeta(t.ms ? 'mut' : t.st);
  const pr = prMeta(t.pr);
  const late = !t.ms && t.st !== 'done' && (t.e ?? 0) < TODAY;
  const editing = s.editId === t.id;
  const gridCols = gridColsFor(s.mobile, s.extraCol);
  const nameFw = rw.hasKids ? 700 : (rw.lvl > 0 ? 400 : 500);
  const bg = s.selId === t.id ? 'var(--accS)' : (rw.hasKids ? 'var(--bg)' : 'transparent');
  const pgTxt = t.ms ? '—' : ((rw.hasKids && !t.pg) ? '' + s.parProg(t.id) : '' + t.pg);
  const stStyle = stMeta(t.ms ? 'mut' : t.st);

  useEffect(() => { if (editing && editRef.current) { editRef.current.focus(); editRef.current.select(); } }, [editing]);

  const openMenu = (field: string, e: React.MouseEvent) => { e.stopPropagation(); const r = (e.currentTarget as HTMLElement).getBoundingClientRect(); const base = dateOf(field === 'ds' ? (t.s ?? TODAY) : field === 'de' ? (t.e ?? TODAY) : TODAY); s.set({ cellMenu: { tid: t.id, field, x: Math.min(r.left, window.innerWidth - 230), y: Math.min(r.bottom + 4, window.innerHeight - 290) }, cmCal: { y: base.getUTCFullYear(), m: base.getUTCMonth() } }); };
  const cellHover = { background: 'var(--hover)' };

  return (
    <Hover onMouseEnter={() => s.set({ hovId: t.id })} onMouseLeave={() => s.set((x) => (x.hovId === t.id ? { hovId: null } : {}))} onClick={() => s.set({ selId: t.id })} style={{ display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', height: rh, borderBottom: '1px solid var(--line2)', fontSize: 13, background: bg, position: 'relative', cursor: 'pointer' }} hover={{}}>
      {s.criticalOn && t.crit && <span style={{ position: 'absolute', left: 0, top: 5, bottom: 5, width: 2.5, background: 'var(--bd)', borderRadius: 2 }} />}
      <span style={{ padding: `0 6px 0 ${14 + rw.lvl * 16}px`, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, height: '100%' }}>
        {rw.hasKids && <svg onClick={(e) => { e.stopPropagation(); s.set((x) => ({ collapsed: { ...x.collapsed, [t.id]: !x.collapsed[t.id] } })); }} style={{ flex: 'none', cursor: 'pointer', transform: `rotate(${s.collapsed[t.id] ? 0 : 90}deg)`, transition: 'transform .15s' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>}
        {t.ms && <svg style={{ flex: 'none' }} width="10" height="10" viewBox="0 0 24 24" fill="var(--msC)"><path d="M12 2l6 10-6 10-6-10z" /></svg>}
        {!rw.hasKids && !t.ms && <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotFor(t.st === 'ok' ? 'ok' : t.st), flex: 'none' }} />}
        {editing ? (
          <input ref={editRef} value={s.editVal} onChange={(e) => s.set({ editVal: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') { if (s.editVal.trim()) s.updateTask(t.id, { name: s.editVal.trim() }); s.set({ editId: null }); } if (e.key === 'Escape') s.set({ editId: null }); }} onBlur={() => { if (s.editVal.trim()) s.updateTask(t.id, { name: s.editVal.trim() }); s.set({ editId: null }); }} onMouseDown={(e) => e.stopPropagation()} style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 500, color: 'var(--txt)', background: 'var(--card)', border: '1.5px solid var(--acc)', borderRadius: 5, padding: '2px 6px' }} />
        ) : (
          <>
            <span onDoubleClick={(e) => { e.stopPropagation(); s.set({ editId: t.id, editVal: t.name }); }} style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontWeight: nameFw as any, color: 'var(--txt)' }}>{t.name}</span>
            {s.hovId === t.id && (
              <span onMouseDown={(e) => e.stopPropagation()} style={{ display: 'flex', gap: 2, flex: 'none', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 7, padding: 2, boxShadow: 'var(--sh1)' }}>
                <svg onClick={(e) => { e.stopPropagation(); s.openTask(t.id); }} title="Open" style={{ cursor: 'pointer', padding: 2, borderRadius: 4 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2" strokeLinecap="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                <svg onClick={(e) => { e.stopPropagation(); const id = s.addTask('New subtask', t.pid, t.id, t.s ?? TODAY); if (s.statusFilter && !s.statusFilter.mut) s.pushToast('Subtask added — clear the status filter to see it'); else s.set({ editId: id, editVal: 'New subtask' }); }} title="Add subtask" style={{ cursor: 'pointer', padding: 2, borderRadius: 4 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                <svg onClick={(e) => { e.stopPropagation(); if (i > 0) { const above = rowsArr[i - 1].t; if (above.id !== t.id) { s.updateTask(t.id, { par: above.id }); s.pushToast('Task indented'); } } }} title="Indent" style={{ cursor: 'pointer', padding: 2, borderRadius: 4 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18M11 9h10M11 13h10M3 17h18M3 9l4 3-4 3" /></svg>
                <svg onClick={(e) => { e.stopPropagation(); s.deleteTask(t.id); }} title="Delete" style={{ cursor: 'pointer', padding: 2, borderRadius: 4 }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--bdT)" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
              </span>
            )}
          </>
        )}
      </span>
      <Hover onClick={(e: any) => openMenu('av', e)} onMouseDown={(e: any) => e.stopPropagation()} style={{ padding: '0 5px', height: '100%', display: 'flex', alignItems: 'center' }} hover={cellHover}>
        {t.a ? <span title={s.members[t.a]?.n || 'Former workspace member'} style={{ width: 20, height: 20, borderRadius: '50%', background: s.members[t.a]?.c || 'var(--txt3)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800 }}>{s.members[t.a] ? t.a : '?'}</span>
          : (!rw.hasKids && !t.ms ? <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--txt3)', display: 'grid', placeItems: 'center', color: 'var(--txt3)', fontSize: 10 }}>+</span> : null)}
      </Hover>
      <Hover onClick={(e: any) => openMenu('st', e)} onMouseDown={(e: any) => e.stopPropagation()} style={{ padding: '0 8px', height: '100%', display: 'flex', alignItems: 'center' }} hover={cellHover}><span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 9px', borderRadius: 99, background: stStyle.b, color: stStyle.t, whiteSpace: 'nowrap' }}>{t.ms ? 'Milestone' : st.l}</span></Hover>
      {!s.mobile && <><Hover onClick={(e: any) => openMenu('pr', e)} onMouseDown={(e: any) => e.stopPropagation()} style={{ padding: '0 6px', height: '100%', display: 'flex', alignItems: 'center' }} hover={cellHover} title={pr.t}><svg width="12" height="12" viewBox="0 0 24 24" fill={pr.c} stroke={pr.c} strokeWidth="2" strokeLinecap="round"><path d="M4 21V4" /><path d="M4 4h12l-2.5 4L16 12H4" stroke="none" /></svg></Hover>
      <Hover onClick={(e: any) => openMenu('ds', e)} onMouseDown={(e: any) => e.stopPropagation()} style={{ padding: '0 8px', color: 'var(--txt2)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', height: '100%', display: 'flex', alignItems: 'center', fontSize: 12.5 }} hover={cellHover}>{t.s != null ? fmt(t.s) : '—'}</Hover>
      <Hover onClick={(e: any) => openMenu('de', e)} onMouseDown={(e: any) => e.stopPropagation()} style={{ padding: '0 8px', color: late ? 'var(--bdT)' : 'var(--txt2)', fontWeight: late ? 700 : 400, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', height: '100%', display: 'flex', alignItems: 'center', fontSize: 12.5 }} hover={cellHover}>{t.ms ? '—' : (t.e != null ? fmt(t.e) : '—')}</Hover>
      <Hover onClick={(e: any) => openMenu('pg', e)} onMouseDown={(e: any) => e.stopPropagation()} style={{ padding: '0 8px', color: 'var(--txt2)', fontVariantNumeric: 'tabular-nums', fontSize: 12.5, height: '100%', display: 'flex', alignItems: 'center' }} hover={cellHover}>{pgTxt}</Hover>
      {s.extraCol && <span style={{ padding: '0 8px', color: 'var(--txt2)', fontSize: 11.5, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={cfId ? fmtCfVal(t.cf?.[cfId]) : undefined}>{cfId ? fmtCfVal(t.cf?.[cfId]) : '—'}</span>}</>}
      <span />
    </Hover>
  );
}
