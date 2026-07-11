import type { CSSProperties, ReactNode } from 'react';
import { useStore } from '../store';
import { stMeta, prMeta } from '../lib/meta';

export function Avatar({ id, size = 24, ring, style }: { id: string | null; size?: number; ring?: string; style?: CSSProperties }) {
  const members = useStore((s) => s.members);
  if (!id) {
    return (
      <span style={{ width: size, height: size, borderRadius: '50%', border: '1.5px dashed var(--txt3)', display: 'grid', placeItems: 'center', color: 'var(--txt3)', fontSize: size * 0.42, flex: 'none', ...style }}>+</span>
    );
  }
  const m = members[id];
  return (
    <span style={{ width: size, height: size, borderRadius: '50%', background: m?.c || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: Math.max(8, size * 0.36), fontWeight: 800, flex: 'none', border: ring ? `2px solid ${ring}` : undefined, ...style }}>
      {id}
    </span>
  );
}

export function StatusPill({ st, ms, style }: { st: string; ms?: boolean; style?: CSSProperties }) {
  const m = stMeta(ms ? 'mut' : st);
  return (
    <span style={{ fontSize: 10.5, fontWeight: 700, padding: '2.5px 9px', borderRadius: 99, background: m.b, color: m.t, whiteSpace: 'nowrap', ...style }}>
      {ms ? 'Milestone' : m.l}
    </span>
  );
}

export function PriorityFlag({ pr, size = 12 }: { pr: string; size?: number }) {
  const m = prMeta(pr);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={m.c} stroke={m.c} strokeWidth="2" strokeLinecap="round">
      <path d="M4 21V4" />
      <path d="M4 4h12l-2.5 4L16 12H4" stroke="none" />
    </svg>
  );
}

export function ProgressBar({ pct, h = 6, color = 'var(--acc)', track = 'var(--line2)', style }: { pct: number; h?: number; color?: string; track?: string; style?: CSSProperties }) {
  return (
    <div style={{ height: h, borderRadius: 99, background: track, overflow: 'hidden', ...style }}>
      <div style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: '100%', background: color, borderRadius: 99, transition: 'width .25s' }} />
    </div>
  );
}

// Small icon set (lucide-style). Pass name; falls back to a dot.
const PATHS: Record<string, ReactNode> = {
  x: <path d="M18 6L6 18M6 6l12 12" />,
  expand: <><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  chevRight: <path d="M9 6l6 6-6 6" />,
  chevDown: <path d="M6 9l6 6 6-6" />,
  search: <><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></>,
  spark: <><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></>,
  check: <path d="M5 13l4 4L19 7" />,
};
export function Icon({ name, size = 14, color = 'currentColor', sw = 2, fill = 'none', style }: { name: string; size?: number; color?: string; sw?: number; fill?: string; style?: CSSProperties }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={fill} stroke={color} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" style={style}>
      {PATHS[name] || <circle cx="12" cy="12" r="4" fill={color} />}
    </svg>
  );
}
