// Wave-6 charts. Lightweight, theme-aware inline-SVG charts — no external libs.
// Colours come from the app's CSS custom properties so light/dark both work.
import { fmt } from '../lib/dates';

function NoData({ h = 90 }: { h?: number }) {
  return (
    <div style={{ height: h, display: 'grid', placeItems: 'center', fontSize: 11, color: 'var(--txt3)' }}>
      No data yet
    </div>
  );
}

// rounded-top column path (flat baseline, rounded top corners)
function topRect(x: number, y: number, w: number, h: number, r = 3): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x} ${y + h} L${x} ${y + rr} Q${x} ${y} ${x + rr} ${y} L${x + w - rr} ${y} Q${x + w} ${y} ${x + w} ${y + rr} L${x + w} ${y + h} Z`;
}

// ---- Sparkline -------------------------------------------------------------
export function Sparkline({ points, color = 'var(--acc)', w = 64, h = 18 }: { points: number[]; color?: string; w?: number; h?: number }) {
  const pts = (points || []).filter((n) => typeof n === 'number' && isFinite(n));
  if (pts.length < 2) {
    return (
      <svg width={w} height={h} style={{ display: 'block' }} aria-hidden>
        <line x1={0} y1={h / 2} x2={w} y2={h / 2} stroke="var(--line)" strokeWidth={1.5} strokeDasharray="2 3" />
      </svg>
    );
  }
  const min = Math.min(...pts), max = Math.max(...pts), span = max - min || 1, pad = 2;
  const x = (i: number) => (i / (pts.length - 1)) * w;
  const y = (v: number) => pad + (1 - (v - min) / span) * (h - pad * 2);
  const d = pts.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: 'block', overflow: 'visible' }} aria-hidden>
      <path d={d} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1])} r={2} fill={color} />
    </svg>
  );
}

// ---- Burndown --------------------------------------------------------------
type BurndownPoint = { day: number; ideal: number; remaining: number; completed?: number };
export function Burndown({ data }: { data: { points?: BurndownPoint[] } }) {
  const pts = (data?.points || []).filter((p) => p && typeof p.day === 'number');
  if (pts.length < 2) return <NoData />;
  const VW = 320, VH = 132, PL = 26, PR = 10, PT = 12, PB = 20;
  const maxV = Math.max(1, ...pts.map((p) => Math.max(p.ideal ?? 0, p.remaining ?? 0)));
  const x = (i: number) => PL + (i / (pts.length - 1)) * (VW - PL - PR);
  const y = (v: number) => PT + (1 - v / maxV) * (VH - PT - PB);
  const line = (key: 'ideal' | 'remaining') => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y((p[key] as number) ?? 0).toFixed(1)}`).join(' ');
  const base = VH - PB;
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', gap: 12, marginBottom: 5, fontSize: 9.5, color: 'var(--txt2)' }}>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 13, borderTop: '1.5px dashed var(--txt3)' }} />Ideal</span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}><span style={{ width: 13, height: 2, borderRadius: 2, background: 'var(--acc)' }} />Remaining</span>
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto' }} role="img" aria-label="Burndown: ideal vs remaining tasks">
        {/* axes */}
        <line x1={PL} y1={PT} x2={PL} y2={base} stroke="var(--line)" strokeWidth={1} />
        <line x1={PL} y1={base} x2={VW - PR} y2={base} stroke="var(--line)" strokeWidth={1} />
        {/* y labels */}
        <text x={PL - 4} y={PT + 3} textAnchor="end" fontSize={8.5} fill="var(--txt3)">{maxV}</text>
        <text x={PL - 4} y={base} textAnchor="end" fontSize={8.5} fill="var(--txt3)">0</text>
        {/* ideal (dashed grey) + remaining (accent) */}
        <path d={line('ideal')} fill="none" stroke="var(--txt3)" strokeWidth={1.5} strokeDasharray="4 4" strokeLinecap="round" />
        <path d={line('remaining')} fill="none" stroke="var(--acc)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(pts.length - 1)} cy={y(pts[pts.length - 1].remaining ?? 0)} r={2.6} fill="var(--acc)" />
        {/* x labels: first + last day */}
        <text x={PL} y={base + 13} textAnchor="start" fontSize={8.5} fill="var(--txt3)">{fmt(pts[0].day)}</text>
        <text x={VW - PR} y={base + 13} textAnchor="end" fontSize={8.5} fill="var(--txt3)">{fmt(pts[pts.length - 1].day)}</text>
      </svg>
    </div>
  );
}

// ---- VelocityBars ----------------------------------------------------------
export function VelocityBars({ data }: { data: { week: string; done: number }[] }) {
  const rows = data || [];
  if (!rows.length) return <NoData />;
  const n = rows.length, slot = 40, PB = 20, PT = 16, VH = 128;
  const VW = n * slot;
  const maxV = Math.max(1, ...rows.map((r) => r.done ?? 0));
  const base = VH - PB;
  const bw = 20;
  const bh = (v: number) => (v / maxV) * (base - PT);
  return (
    <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto' }} role="img" aria-label="Velocity: tasks completed per week">
      <line x1={0} y1={base} x2={VW} y2={base} stroke="var(--line)" strokeWidth={1} />
      {rows.map((r, i) => {
        const v = r.done ?? 0, h = bh(v), cx = i * slot + slot / 2;
        return (
          <g key={i}>
            {h > 0 && <path d={topRect(cx - bw / 2, base - h, bw, h, 4)} fill="var(--acc)" />}
            <text x={cx} y={base - h - 4} textAnchor="middle" fontSize={9} fontWeight={700} fill="var(--txt2)">{v}</text>
            <text x={cx} y={base + 13} textAnchor="middle" fontSize={8.5} fill="var(--txt3)">{r.week}</text>
          </g>
        );
      })}
    </svg>
  );
}

// ---- CumulativeFlow --------------------------------------------------------
type CfdRow = { week: string; mut: number; prog: number; risk: number; bad: number; done: number };
// bottom→top stack: completed work accumulates at the base, backlog rides on top.
const CFD_SERIES: { key: keyof Omit<CfdRow, 'week'>; color: string; label: string }[] = [
  { key: 'done', color: 'var(--ok)', label: 'Done' },
  { key: 'prog', color: 'var(--in)', label: 'In progress' },
  { key: 'risk', color: 'var(--wa)', label: 'At risk' },
  { key: 'bad', color: 'var(--bd)', label: 'Overdue' },
  { key: 'mut', color: 'var(--gyB)', label: 'Not started' },
];
export function CumulativeFlow({ data }: { data: CfdRow[] }) {
  const rows = data || [];
  if (!rows.length) return <NoData />;
  const VW = 320, VH = 128, PL = 8, PR = 8, PT = 8, PB = 18;
  const totals = rows.map((r) => CFD_SERIES.reduce((a, s) => a + (r[s.key] ?? 0), 0));
  const maxV = Math.max(1, ...totals);
  const denom = Math.max(1, rows.length - 1);
  const x = (i: number) => PL + (i / denom) * (VW - PL - PR);
  const y = (v: number) => PT + (1 - v / maxV) * (VH - PT - PB);
  const base = VH - PB;
  // cumulative baselines per row, growing as we stack upward
  const cum = rows.map(() => 0);
  const bands = CFD_SERIES.map((s) => {
    const lower = rows.map((_, i) => cum[i]);
    rows.forEach((r, i) => { cum[i] += r[s.key] ?? 0; });
    const upper = rows.map((_, i) => cum[i]);
    // polygon: upper edge L→R, then lower edge R→L
    const top = rows.map((_, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(upper[i]).toFixed(1)}`).join(' ');
    const bot = rows.map((_, i) => { const j = rows.length - 1 - i; return `L${x(j).toFixed(1)} ${y(lower[j]).toFixed(1)}`; }).join(' ');
    return { d: `${top} ${bot} Z`, color: s.color };
  });
  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '3px 10px', marginBottom: 5, fontSize: 9.5, color: 'var(--txt2)' }}>
        {CFD_SERIES.map((s) => (
          <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flex: 'none' }} />{s.label}
          </span>
        ))}
      </div>
      <svg viewBox={`0 0 ${VW} ${VH}`} preserveAspectRatio="xMidYMid meet" style={{ display: 'block', width: '100%', height: 'auto' }} role="img" aria-label="Cumulative flow by status">
        {bands.map((b, i) => b.d && <path key={i} d={b.d} fill={b.color} stroke="var(--card)" strokeWidth={0.6} opacity={0.9} />)}
        <line x1={PL} y1={base} x2={VW - PR} y2={base} stroke="var(--line)" strokeWidth={1} />
        {rows.map((r, i) => (i === 0 || i === rows.length - 1 || rows.length <= 8) && (
          <text key={i} x={x(i)} y={base + 12} textAnchor={i === 0 ? 'start' : i === rows.length - 1 ? 'end' : 'middle'} fontSize={8} fill="var(--txt3)">{r.week}</text>
        ))}
      </svg>
    </div>
  );
}
