import type { Task } from '../types';
import type { VState } from '../store';
import { EP, dayMs, dowIdx, fmt, TODAY } from './dates';
import { MO, DW, ppdFor, rowHFor, barHFor, RANGE_END } from './meta';

export type VisRow = { t: Task; lvl: number; hasKids: boolean };

export function effDates(t: Task, drag: any, pend: any) {
  let s = t.s ?? 0, e = t.e ?? 0;
  const ap = (dd: number, mode: string) => {
    if (mode === 'move') { s += dd; e += dd; }
    else if (mode === 'l') { s = Math.min(s + dd, e); }
    else { e = Math.max(e + dd, s); }
  };
  if (drag && drag.id === t.id) ap(drag.dd, drag.mode);
  else if (pend && pend.id === t.id) ap(pend.dd, 'move');
  return { s, e };
}

export function visRows(tasks: Task[], projectId: string, collapsed: Record<string, boolean>, statusFilter: Record<string, number> | null): VisRow[] {
  const byPar: Record<string, Task[]> = {};
  tasks.filter((t) => t.pid === projectId).forEach((t) => {
    const k = t.par || 'root';
    (byPar[k] = byPar[k] || []).push(t);
  });
  const out: VisRow[] = [];
  const walk = (pid: string, lvl: number) => {
    (byPar[pid] || []).forEach((t) => {
      if (t.s === null) return;
      const hasKids = (byPar[t.id] || []).length > 0;
      if (statusFilter && !hasKids && !statusFilter[t.st]) return;
      out.push({ t, lvl, hasKids });
      if (hasKids && !collapsed[t.id]) walk(t.id, lvl + 1);
    });
  };
  walk('root', 0);
  return out;
}

export function buildTimeline(zoom: string) {
  const ppd = ppdFor(zoom);
  const RE = RANGE_END;
  const months: { x: number; w: number; label: string }[] = [];
  {
    let d = 0;
    while (d < RE) {
      const dt = new Date(EP + d * dayMs);
      const m = dt.getUTCMonth(), y = dt.getUTCFullYear();
      const nm = Date.UTC(y, m + 1, 1);
      const end = Math.min(Math.round((nm - EP) / dayMs), RE);
      const w = (end - d) * ppd;
      months.push({ x: d * ppd, w, label: w > 92 ? MO[m] + ' ' + y : MO[m] });
      d = end;
    }
  }
  const subs: any[] = [];
  if (zoom === 'day') {
    for (let d = 0; d < RE; d++) {
      const dw = dowIdx(d), dt = new Date(EP + d * dayMs), wk = dw >= 5, td = d === TODAY;
      subs.push({ x: d * ppd, w: ppd, bg: wk ? 'var(--wknd)' : 'transparent', l1: DW[dw], c1: td ? 'var(--accT)' : 'var(--txt3)', l2: '' + dt.getUTCDate(), c2: td ? '#fff' : (wk ? 'var(--txt3)' : 'var(--txt2)'), fw2: td ? '800' : '600', pill: td ? 'var(--acc)' : 'transparent' });
    }
  } else if (zoom === 'week') {
    for (let d = 0; d < RE; d += 7) {
      const td = TODAY >= d && TODAY < d + 7;
      subs.push({ x: d * ppd, w: 7 * ppd, bg: 'transparent', l1: '', c1: 'var(--txt3)', l2: fmt(d), c2: td ? 'var(--accT)' : 'var(--txt2)', fw2: td ? '800' : '600', pill: 'transparent' });
    }
  } else if (zoom === 'month') {
    for (let d = 0; d < RE; d += 7) {
      subs.push({ x: d * ppd, w: 7 * ppd, bg: 'transparent', l1: '', c1: 'var(--txt3)', l2: '' + new Date(EP + d * dayMs).getUTCDate(), c2: 'var(--txt3)', fw2: '600', pill: 'transparent' });
    }
  } else {
    // real calendar-quarter bands: iterate months from EP and group by quarter
    months.length = 0;
    let d = 0, qStart = 0, qKey = '', qLabel = '';
    while (d < RE) {
      const dt = new Date(EP + d * dayMs);
      const m = dt.getUTCMonth(), y = dt.getUTCFullYear();
      const q = Math.floor(m / 3);
      const key = y + '-' + q;
      if (key !== qKey) {
        if (qKey) months.push({ x: qStart * ppd, w: (d - qStart) * ppd, label: qLabel });
        qKey = key; qStart = d; qLabel = 'Q' + (q + 1) + ' ' + y;
      }
      const nm = Date.UTC(y, m + 1, 1);
      const end = Math.min(Math.round((nm - EP) / dayMs), RE);
      subs.push({ x: d * ppd, w: (end - d) * ppd, bg: 'transparent', l1: '', c1: 'var(--txt3)', l2: MO[m], c2: 'var(--txt2)', fw2: '600', pill: 'transparent' });
      d = end;
    }
    if (qKey) months.push({ x: qStart * ppd, w: (RE - qStart) * ppd, label: qLabel });
  }
  const wkBand = (zoom === 'day' || zoom === 'week') ? `repeating-linear-gradient(90deg,transparent 0 ${5 * ppd}px,var(--wknd) ${5 * ppd}px ${7 * ppd}px),` : '';
  const gridStep = zoom === 'day' ? ppd : 7 * ppd;
  const canvasBg = wkBand + `repeating-linear-gradient(90deg,transparent 0 ${gridStep - 1}px,var(--line2) ${gridStep - 1}px ${gridStep}px)`;
  const monthLines = months.filter((m) => m.x > 0).map((m) => ({ x: m.x }));
  return { ppd, RE, months, subs, canvasBg, monthLines, cw: RE * ppd };
}

export const geom = (s: Pick<VState, 'zoom' | 'density'>) => ({
  ppd: ppdFor(s.zoom), rh: rowHFor(s.density), bh: barHFor(s.density),
});
