import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { visRows, effDates } from '../lib/gantt';
import { MO } from '../lib/meta';
import { EP, dayMs, fmt, TODAY, dateOf } from '../lib/dates';

const DOW3 = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
import { Hover } from '../components/Hover';

const PRES_STBAR: Record<string, { bg: string; fill: string; lc: string }> = {
  done: { bg: '#22C55E', fill: 'transparent', lc: '#fff' },
  prog: { bg: 'var(--blB)', fill: 'var(--in)', lc: '#fff' },
  risk: { bg: 'var(--amB)', fill: 'var(--wa)', lc: '#713F12' },
  bad: { bg: 'var(--bdB)', fill: 'var(--bd)', lc: '#fff' },
  mut: { bg: 'var(--gyB)', fill: 'transparent', lc: 'var(--gyT)' },
};

export function Present() {
  const s = useStore();
  // Re-fit when the viewport changes (present mode is auto-fit to width/height).
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!s.present) return;
    const on = () => setTick((t) => t + 1);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, [s.present]);

  if (!s.present) return null;

  const proj = s.proj(s.projectId) || s.projects[0];
  const all = s.tasks.filter((t) => t.pid === s.projectId && t.s !== null);
  const rows = visRows(s.tasks, s.projectId, s.collapsed, s.statusFilter);
  if (!proj || !all.length || !rows.length) {
    return (
      <div data-screen-label="Gantt presentation mode" onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 97, background: 'var(--bg)', color: 'var(--txt)', display: 'grid', placeItems: 'center', animation: 'vfade .25s ease' }}>
        <div style={{ textAlign: 'center', maxWidth: 420 }}>
          <div style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.025em', marginBottom: 8 }}>{proj ? proj.name : 'Timeline'}</div>
          <div style={{ fontSize: 13.5, color: 'var(--txt2)', marginBottom: 20 }}>No scheduled tasks to present</div>
          <Hover as="span" onClick={() => s.set({ present: false })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>Exit · Esc</Hover>
        </div>
      </div>
    );
  }

  const minS = Math.min(...all.map((t) => t.s as number)) - 2;
  const maxE = Math.max(...all.map((t) => t.e as number)) + 5;
  const span = maxE - minS;
  const W = typeof window !== 'undefined' ? window.innerWidth : 1440;
  const H = typeof window !== 'undefined' ? window.innerHeight : 820;
  const nameW = W < 980 ? 210 : 300;
  const avail = W - nameW - 84;
  const ppd = avail / span;
  const rh = Math.max(30, Math.min(56, Math.floor((H - 224) / rows.length)));
  const bh = Math.min(rh - 10, 32);
  const X = (d: number) => (d - minS) * ppd;
  const critOn = s.criticalOn;

  // months + weeks (W1–W4 per month)
  const months: { x: number; w: number; label: string; band: string }[] = [];
  const weeks: { x: number; w: number; label: string; k: string }[] = [];
  {
    let d = minS;
    while (d < maxE) {
      const dt = new Date(EP + d * dayMs);
      const m = dt.getUTCMonth(), y = dt.getUTCFullYear();
      const mStart = Date.UTC(y, m, 1);
      const nm = Date.UTC(y, m + 1, 1);
      const end = Math.min(Math.round((nm - EP) / dayMs), maxE);
      months.push({ x: X(d), w: (end - d) * ppd, label: MO[m] + (m === 0 ? ' ' + y : ''), band: months.length % 2 ? 'rgba(110,115,150,.07)' : 'transparent' });
      const monthDayOne = Math.round((mStart - EP) / dayMs);
      for (let k = 0; k < 4; k++) {
        const ws = monthDayOne + k * 7;
        const we = k === 3 ? Math.round((nm - EP) / dayMs) : monthDayOne + (k + 1) * 7;
        const cs = Math.max(ws, d), ce = Math.min(we, end);
        if (ce <= cs) continue;
        weeks.push({ x: X(cs), w: (ce - cs) * ppd, label: 'W' + (k + 1), k: 'w' + y + m + k });
      }
      d = end;
    }
  }
  const monthLines = months.filter((m) => m.x > 0).map((m) => ({ x: m.x }));

  const pos: Record<string, { l: number; r: number; cy: number }> = {};
  type NameRow = { k: string; name: string; pad: number; fw: string; co: string; h: number; ms: boolean; zebra: string };
  const names: NameRow[] = [];
  const bars: any[] = [];
  const sums: any[] = [];
  const mss: any[] = [];
  rows.forEach((rw, i) => {
    const t = rw.t;
    const top = i * rh;
    names.push({ k: 'n' + t.id, name: t.name, pad: rw.lvl * 14, fw: rw.hasKids ? '800' : (rw.lvl ? '500' : '600'), co: rw.hasKids ? 'var(--txt)' : 'var(--txt2)', h: rh, ms: t.ms, zebra: i % 2 ? 'var(--hover)' : 'transparent' });
    const { s: ts, e: te } = effDates(t, null, null);
    const left = X(ts), w = Math.max(ppd, (te - ts + 1) * ppd);
    if (t.ms) {
      const cx = left + ppd / 2;
      pos[t.id] = { l: cx - 8, r: cx + 8, cy: top + rh / 2 };
      const msFlip = cx > avail - 200;
      mss.push({ k: 'm' + t.id, top: top + rh / 2 - 8, left: cx - 8, label: t.name + ' · ' + fmt(te), crit: critOn && t.crit ? '0 0 0 2px var(--bd)' : 'var(--sh1)', lblLeft: msFlip ? 0 : cx + 16, msFlip, msNorm: !msFlip, lblRight: msFlip ? (avail - cx + 16) : 0 });
      return;
    }
    pos[t.id] = { l: left, r: left + w, cy: top + rh / 2 };
    if (rw.hasKids && !t.a) { sums.push({ k: 's' + t.id, top: top + (rh - 10) / 2, left, w }); return; }
    const c = PRES_STBAR[t.st] || PRES_STBAR.mut;
    const nearR = (left + w) > avail - 170;
    const lblIn = w > 130 || (nearR && w >= 76);
    const lblL = !lblIn && nearR;
    bars.push({
      k: 'b' + t.id, top: top + (rh - bh) / 2, left, w, h: bh, bg: c.bg, fill: c.fill, fw: t.st === 'done' ? w : Math.round(w * t.pg / 100),
      lc: lblIn ? c.lc : 'var(--txt2)', lblIn, lblL, lblR: !lblIn && !lblL, label: t.name + (t.pg > 0 && t.st !== 'done' ? ' · ' + t.pg + '%' : ''),
      lblX: lblIn ? 0 : w + 8, ts: lblIn && (t.st === 'prog' || t.st === 'done' || t.st === 'bad') ? '0 1px 2px rgba(0,0,0,.3)' : 'none',
      sh: critOn && t.crit ? '0 0 0 2px var(--bd)' : 'var(--sh1)',
    });
  });

  const deps: { k: string; p: string; ap: string }[] = [];
  rows.forEach((rw) => {
    rw.t.deps.forEach((dp) => {
      if (!dp.crit || !critOn) return;
      const a = pos[dp.t], b = pos[rw.t.id];
      if (!a || !b) return;
      const x1 = a.r, y1 = a.cy, x2 = b.l - 2, y2 = b.cy, o = 8;
      let p: string;
      if (x2 >= x1 + o * 2) p = 'M' + x1 + ' ' + y1 + ' L' + (x1 + o) + ' ' + y1 + ' L' + (x1 + o) + ' ' + y2 + ' L' + x2 + ' ' + y2;
      else { const yb = y2 > y1 ? y1 + rh / 2 : y1 - rh / 2; p = 'M' + x1 + ' ' + y1 + ' L' + (x1 + o) + ' ' + y1 + ' L' + (x1 + o) + ' ' + yb + ' L' + (x2 - o) + ' ' + yb + ' L' + (x2 - o) + ' ' + y2 + ' L' + x2 + ' ' + y2; }
      deps.push({ k: 'd' + dp.t + rw.t.id, p, ap: 'M' + (x2 + 2) + ' ' + y2 + ' l-7 -4.5 v9 z' });
    });
  });

  const leafsP = all.filter((t) => !t.ms && !all.some((x) => x.par === t.id));
  const progP = leafsP.length ? Math.round(leafsP.reduce((a, t) => a + t.pg, 0) / leafsP.length) : 0;
  const riskN = all.filter((t) => t.st === 'risk' || t.st === 'bad').length;
  const nextMs = all.filter((t) => t.ms && (t.e as number) >= TODAY).sort((a, b) => (a.e as number) - (b.e as number))[0];

  const rowsH = rows.length * rh;
  const rangeS = dateOf(minS + 2), rangeE = dateOf(maxE - 5);
  const range = fmt(minS + 2) + (rangeS.getUTCFullYear() !== rangeE.getUTCFullYear() ? ' ' + rangeS.getUTCFullYear() : '') + ' — ' + fmt(maxE - 5) + ' ' + rangeE.getUTCFullYear();
  const tdD = dateOf(TODAY);
  const asOf = DOW3[tdD.getUTCDay()] + ', ' + MO[tdD.getUTCMonth()] + ' ' + tdD.getUTCDate() + ' ' + tdD.getUTCFullYear();
  const stL = ({ ok: 'ON TRACK', risk: 'AT RISK', bad: 'OFF TRACK', mut: 'NOT STARTED' } as Record<string, string>)[proj.st] || '';
  const stB = ({ ok: 'var(--okB)', risk: 'var(--waB)', bad: 'var(--bdB)', mut: 'var(--muB)' } as Record<string, string>)[proj.st];
  const stT = ({ ok: 'var(--okT)', risk: 'var(--waT)', bad: 'var(--bdT)', mut: 'var(--muT)' } as Record<string, string>)[proj.st];
  const nextMsTxt = nextMs ? nextMs.name + ' · ' + fmt(nextMs.e as number) : '—';
  const todayX = TODAY >= minS && TODAY <= maxE ? X(TODAY) + ppd / 2 : -99;

  return (
    <div data-screen-label="Gantt presentation mode" onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', inset: 0, zIndex: 97, background: 'var(--bg)', color: 'var(--txt)', display: 'flex', flexDirection: 'column', animation: 'vfade .25s ease' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 14, padding: '22px 34px 14px' }}>
        <div style={{ width: 34, height: 34, borderRadius: 10, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center', boxShadow: '0 4px 14px var(--ring)' }}><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l7 8-7 8" /><path d="M13 4l7 8-7 8" /></svg></div>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}><span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-.025em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.name}</span><span style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.05em', padding: '4px 12px', borderRadius: 99, background: stB, color: stT, flex: 'none' }}>{stL}</span></div>
          <div style={{ fontSize: 13.5, color: 'var(--txt2)', marginTop: 2 }}>Timeline · {range} · as of {asOf}</div>
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 22, flex: 'none' }}>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Progress</div><div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em' }}>{progP}%</div></div>
          <div style={{ textAlign: 'right' }}><div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Attention</div><div style={{ fontSize: 23, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--waT)' }}>{riskN} tasks</div></div>
          <div style={{ textAlign: 'right', maxWidth: 250 }}><div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Next milestone</div><div style={{ fontSize: 15, fontWeight: 700, marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>◆ {nextMsTxt}</div></div>
          <Hover as="span" onClick={() => s.set({ present: false })} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>Exit · Esc</Hover>
        </div>
      </div>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 15, padding: '0 34px 12px', fontSize: 12.5, fontWeight: 600, color: 'var(--txt2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 20, height: 10, borderRadius: 4, background: '#22C55E' }} />Done</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 20, height: 10, borderRadius: 4, background: 'var(--blB)', position: 'relative', overflow: 'hidden' }}><span style={{ position: 'absolute', inset: 0, width: '55%', background: 'var(--in)' }} /></span>In progress</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 20, height: 10, borderRadius: 4, background: 'var(--amB)', position: 'relative', overflow: 'hidden' }}><span style={{ position: 'absolute', inset: 0, width: '38%', background: 'var(--wa)' }} /></span>At risk</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 20, height: 10, borderRadius: 4, background: 'var(--bdB)', position: 'relative', overflow: 'hidden' }}><span style={{ position: 'absolute', inset: 0, width: '70%', background: 'var(--bd)' }} /></span>Overdue</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 20, height: 10, borderRadius: 4, background: 'var(--gyB)' }} />Not started</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 9, height: 9, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 2 }} />Milestone</span>
        {critOn && <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 20, height: 10, borderRadius: 4, background: 'var(--gyB)', boxShadow: '0 0 0 2px var(--bd)' }} />Critical path</span>}
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><span style={{ width: 2, height: 13, background: 'var(--tdy)', borderRadius: 2 }} />Today</span>
      </div>
      <div style={{ flex: 1, minHeight: 0, margin: '0 34px 26px', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--sh2)', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', display: 'flex', borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
          <span style={{ width: nameW, flex: 'none', display: 'flex', alignItems: 'center', padding: '0 18px', fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', borderRight: '1px solid var(--line)' }}>Task</span>
          <div style={{ flex: 1, position: 'relative' }}>
            <div style={{ position: 'relative', height: 27 }}>
              {months.map((m, i) => (<span key={'mh' + i} style={{ position: 'absolute', left: m.x, width: m.w, top: 0, height: 27, display: 'flex', alignItems: 'center', padding: '0 10px', fontSize: 14, fontWeight: 800, color: 'var(--txt)', background: m.band, borderRight: '1px solid var(--line2)', whiteSpace: 'nowrap', overflow: 'hidden' }}>{m.label}</span>))}
              {monthLines.map((ml, i) => (<span key={'mlh' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: ml.x, width: 1.5, background: 'var(--txt3)', opacity: .5 }} />))}
            </div>
            <div style={{ position: 'relative', height: 21, borderTop: '1px solid var(--line2)' }}>
              {weeks.map((w) => (<span key={w.k} style={{ position: 'absolute', left: w.x, width: w.w, top: 0, height: 21, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'var(--txt2)', letterSpacing: '.04em', borderRight: '1px solid var(--line)', overflow: 'hidden' }}>{w.label}</span>))}
              {monthLines.map((ml, i) => (<span key={'mlw' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: ml.x, width: 1.5, background: 'var(--txt3)', opacity: .5 }} />))}
            </div>
          </div>
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', display: 'flex' }}>
          <div style={{ width: nameW, flex: 'none', borderRight: '1px solid var(--line)' }}>
            {names.map((n) => (
              <div key={n.k} style={{ height: n.h, display: 'flex', alignItems: 'center', gap: 6, padding: '0 14px 0 18px', background: n.zebra, borderBottom: '1px solid var(--line2)' }}>
                {n.ms && <svg style={{ flex: 'none' }} width="10" height="10" viewBox="0 0 24 24" fill="var(--msC)"><path d="M12 2l6 10-6 10-6-10z" /></svg>}
                <span style={{ paddingLeft: n.pad, fontSize: 15, fontWeight: n.fw as any, color: n.co, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{n.name}</span>
              </div>
            ))}
          </div>
          <div style={{ flex: 1, position: 'relative', minWidth: 0 }}>
            <div style={{ position: 'relative', height: rowsH }}>
              {months.map((m, i) => (<span key={'mb' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: m.x, width: m.w, background: m.band }} />))}
              {weeks.map((w) => (<span key={'wl' + w.k} style={{ position: 'absolute', top: 0, bottom: 0, left: w.x, width: 1, background: 'var(--line)' }} />))}
              {monthLines.map((ml, i) => (<span key={'mlb' + i} style={{ position: 'absolute', top: 0, bottom: 0, left: ml.x, width: 1.5, background: 'var(--txt3)', opacity: .5 }} />))}
              {names.map((n) => (<div key={'r' + n.k} style={{ height: n.h, background: n.zebra, borderBottom: '1px solid var(--line2)' }} />))}
              <div style={{ position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, pointerEvents: 'none' }}>
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: todayX, width: 2.5, background: 'var(--tdy)', zIndex: 4 }}><span style={{ position: 'absolute', top: 4, left: -19, fontSize: 8.5, fontWeight: 800, color: '#fff', background: 'var(--tdy)', borderRadius: 4, padding: '2px 6px', letterSpacing: '.04em' }}>TODAY</span></div>
                <svg width="100%" height={rowsH} style={{ position: 'absolute', inset: 0, zIndex: 3 }}>
                  {deps.map((d) => (<g key={d.k}><path d={d.p} fill="none" stroke="var(--bd)" strokeWidth="1.8" opacity=".85" /><path d={d.ap} fill="var(--bd)" opacity=".85" /></g>))}
                </svg>
                {sums.map((b) => (
                  <div key={b.k} style={{ position: 'absolute', top: b.top, left: b.left, width: b.w, height: 10, zIndex: 2 }}><div style={{ position: 'absolute', inset: 0, background: 'var(--sum)', borderRadius: 3 }} /><div style={{ position: 'absolute', left: 0, bottom: -4, width: 3, height: 8, background: 'var(--sum)' }} /><div style={{ position: 'absolute', right: 0, bottom: -4, width: 3, height: 8, background: 'var(--sum)' }} /></div>
                ))}
                {bars.map((b) => (
                  <div key={b.k} style={{ position: 'absolute', top: b.top, left: b.left, width: b.w, height: b.h, borderRadius: 7, background: b.bg, boxShadow: b.sh, zIndex: 2 }}>
                    <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: b.fw, background: b.fill, borderRadius: '7px 0 0 7px', maxWidth: '100%' }} />
                    {b.lblL && <span style={{ position: 'absolute', right: '100%', marginRight: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--txt2)', whiteSpace: 'nowrap' }}>{b.label}</span>}
                    {b.lblR && <span style={{ position: 'absolute', left: b.lblX, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--txt2)', whiteSpace: 'nowrap' }}>{b.label}</span>}
                    {b.lblIn && <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, maxWidth: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', padding: '0 9px', fontSize: 13.5, fontWeight: 700, color: b.lc, whiteSpace: 'nowrap', textShadow: b.ts }}>{b.label}</span>}
                  </div>
                ))}
                {mss.map((b) => (
                  <div key={b.k}>
                    <div style={{ position: 'absolute', top: b.top, left: b.left, zIndex: 2 }}><div style={{ width: 16, height: 16, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 3.5, boxShadow: b.crit }} /></div>
                    {b.msNorm && <span style={{ position: 'absolute', top: b.top, left: b.lblLeft, height: 16, display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--txt2)', whiteSpace: 'nowrap', zIndex: 2 }}>{b.label}</span>}
                    {b.msFlip && <span style={{ position: 'absolute', top: b.top, right: b.lblRight, height: 16, display: 'flex', alignItems: 'center', fontSize: 13.5, fontWeight: 700, color: 'var(--txt2)', whiteSpace: 'nowrap', zIndex: 2 }}>{b.label}</span>}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
