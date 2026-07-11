// Status / priority metadata + Gantt geometry — ported from the prototype.

export const MO = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
export const DW = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

export type StMeta = { l: string; b: string; t: string };
export function stMeta(st: string): StMeta {
  return (
    {
      done: { l: 'Done', b: 'var(--okB)', t: 'var(--okT)' },
      prog: { l: 'In progress', b: 'var(--inB)', t: 'var(--inT)' },
      risk: { l: 'At risk', b: 'var(--waB)', t: 'var(--waT)' },
      bad: { l: 'Overdue', b: 'var(--bdB)', t: 'var(--bdT)' },
      mut: { l: 'Not started', b: 'var(--muB)', t: 'var(--muT)' },
    } as Record<string, StMeta>
  )[st] || { l: st, b: 'var(--muB)', t: 'var(--muT)' };
}

export function prMeta(pr: string): { c: string; t: string } {
  return (
    {
      urgent: { c: '#DC2626', t: 'Urgent' },
      high: { c: '#F59E0B', t: 'High' },
      med: { c: '#94A3B8', t: 'Medium' },
      low: { c: '#D4D4D8', t: 'Low' },
    } as Record<string, { c: string; t: string }>
  )[pr] || { c: '#94A3B8', t: 'Medium' };
}

export function dotFor(st: string): string {
  return ({ ok: 'var(--ok)', prog: 'var(--in)', risk: 'var(--wa)', bad: 'var(--bd)', mut: 'var(--txt3)' } as Record<string, string>)[st] || 'var(--txt3)';
}

// status bar rendering colours for the Gantt
export const stBar: Record<string, { bg: string; fill: string; lc: string; ts: string }> = {
  done: { bg: '#22C55E', fill: 'transparent', lc: '#fff', ts: '0 1px 2px rgba(0,0,0,.25)' },
  prog: { bg: 'var(--blB)', fill: 'var(--in)', lc: '#fff', ts: '0 1px 2px rgba(0,0,0,.35)' },
  risk: { bg: 'var(--amB)', fill: 'var(--wa)', lc: '#713F12', ts: 'none' },
  bad: { bg: 'var(--bdB)', fill: 'var(--bd)', lc: '#fff', ts: '0 1px 2px rgba(0,0,0,.35)' },
  mut: { bg: 'var(--gyB)', fill: 'transparent', lc: 'var(--gyT)', ts: 'none' },
};

export const ppdFor = (zoom: string) => ({ day: 20, week: 9, month: 4, quarter: 2 } as Record<string, number>)[zoom] ?? 20;
export const rowHFor = (density: string) => (density === 'comf' ? 36 : 29);
export const barHFor = (density: string) => (density === 'comf' ? 22 : 18);
export const RANGE_END = 190;

export const ACCENTS = ['indigo', 'blue', 'teal', 'violet', 'sunset', 'rose', 'fuchsia', 'slate'];
export const ACCENT_LABEL: Record<string, string> = {
  indigo: 'Indigo', blue: 'Ocean Blue', teal: 'Teal', violet: 'Violet',
  sunset: 'Sunset', rose: 'Rose', fuchsia: 'Fuchsia', slate: 'Slate',
};
export const ACCENT_SWATCH: Record<string, string> = {
  indigo: '#6366F1', blue: '#0068B7', teal: '#0D9488', violet: '#7C3AED',
  sunset: '#EA580C', rose: '#E11D48', fuchsia: '#C026D3', slate: '#475569',
};
