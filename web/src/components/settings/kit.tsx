// Shared primitives for the Settings screen panels. Imported only by
// screens/Settings.tsx and the sibling settings/* panels.
import { useState, type CSSProperties, type ReactNode } from 'react';
import { Hover } from '../Hover';

export const cardStyle: CSSProperties = {
  background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14,
  padding: 15, boxShadow: 'var(--sh1)', display: 'flex', flexDirection: 'column', minWidth: 0,
};

export const subCardStyle: CSSProperties = {
  border: '1px solid var(--line2)', borderRadius: 10, padding: '9px 11px', marginBottom: 7,
};

export const mono = 'ui-monospace,SFMono-Regular,Menlo,monospace';

export function CardHead({ icon, iconBg, title, right }: { icon: ReactNode; iconBg: string; title: string; right?: ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 10 }}>
      <span style={{ width: 30, height: 30, borderRadius: 9, background: iconBg, display: 'grid', placeItems: 'center', fontSize: 13, flex: 'none' }}>{icon}</span>
      <span style={{ fontSize: 13, fontWeight: 800, flex: 1, minWidth: 0 }}>{title}</span>
      {right}
    </div>
  );
}

export function SectionTitle({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, ...style }}>{children}</div>;
}

export function Toggle({ on, onClick }: { on: boolean; onClick?: () => void }) {
  return (
    <span onClick={onClick} style={{ width: 30, height: 17, borderRadius: 99, background: on ? 'var(--acc)' : 'var(--muB)', position: 'relative', cursor: onClick ? 'pointer' : 'default', transition: 'background .15s', flex: 'none', display: 'inline-block' }}>
      <span style={{ position: 'absolute', top: 2, left: on ? 15 : 2, width: 13, height: 13, borderRadius: '50%', background: '#fff', transition: 'left .15s', boxShadow: 'var(--sh1)' }} />
    </span>
  );
}

type BtnKind = 'primary' | 'ghost' | 'danger';
export function btnStyle(kind: BtnKind = 'primary', disabled = false): CSSProperties {
  const base: CSSProperties = { fontSize: 11, fontWeight: 700, borderRadius: 8, padding: '6px 12px', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' };
  if (kind === 'primary') return { ...base, background: 'var(--acc)', color: '#fff', border: '1px solid var(--acc)' };
  if (kind === 'danger') return { ...base, background: 'transparent', color: 'var(--bdT)', border: '1px solid var(--line)' };
  return { ...base, background: 'var(--bg)', color: 'var(--txt2)', border: '1px solid var(--line)' };
}

export const inputStyle: CSSProperties = {
  width: '100%', fontSize: 12, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--line)',
  background: 'var(--inputBg)', color: 'var(--txt)', outline: 'none', boxSizing: 'border-box',
};

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label style={{ display: 'block', marginBottom: 9 }}>
      <span style={{ display: 'block', fontSize: 10.5, fontWeight: 700, color: 'var(--txt2)', marginBottom: 4 }}>{label}</span>
      {children}
    </label>
  );
}

export function Chk({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <Hover as="label" onClick={onChange} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 6px', borderRadius: 7, cursor: 'pointer', fontSize: 11.5, color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>
      <span style={{ width: 15, height: 15, borderRadius: 4, border: `1.5px solid ${checked ? 'var(--acc)' : 'var(--line)'}`, background: checked ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center', flex: 'none' }}>
        {checked && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>}
      </span>
      {label}
    </Hover>
  );
}

export async function copyText(txt: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(txt); return true; }
  } catch { /* fall through */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = txt; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    return true;
  } catch { return false; }
}

// Copyable value box. `highlight` renders the emphasized "show once" style used
// for freshly-minted secrets.
export function CopyField({ value, label, highlight }: { value: string; label?: string; highlight?: boolean }) {
  const [copied, setCopied] = useState(false);
  const doCopy = async () => { if (await copyText(value)) { setCopied(true); setTimeout(() => setCopied(false), 1600); } };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, background: highlight ? 'var(--accS)' : 'var(--bg)', border: `1px solid ${highlight ? 'var(--acc)' : 'var(--line2)'}`, borderRadius: 9, padding: '7px 10px', minWidth: 0 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        {label && <span style={{ display: 'block', fontSize: 9.5, color: 'var(--txt3)' }}>{label}</span>}
        <span style={{ fontSize: 10.5, fontFamily: mono, color: highlight ? 'var(--accT)' : 'var(--txt)', wordBreak: 'break-all', display: 'block' }}>{value}</span>
      </div>
      <span onClick={doCopy} style={{ fontSize: 10, fontWeight: 700, color: copied ? 'var(--okT)' : 'var(--accT)', cursor: 'pointer', flex: 'none' }}>{copied ? 'Copied!' : 'Copy'}</span>
    </div>
  );
}

export function Note({ children, tone = 'mut' }: { children: ReactNode; tone?: 'mut' | 'warn' | 'ok' | 'bad' }) {
  const color = tone === 'warn' ? 'var(--waT)' : tone === 'ok' ? 'var(--okT)' : tone === 'bad' ? 'var(--bdT)' : 'var(--txt3)';
  return <div style={{ fontSize: 10, color, lineHeight: 1.5, marginTop: 6 }}>{children}</div>;
}

export function StateRow({ text }: { text: string }) {
  return <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '8px 2px' }}>{text}</div>;
}

// Honest configured / not-configured badge for server-gated channels.
export function StatusBadge({ on, onLabel = 'Configured', offLabel = 'Not configured' }: { on: boolean; onLabel?: string; offLabel?: string }) {
  return (
    <span style={{ fontSize: 9.5, fontWeight: 700, borderRadius: 99, padding: '2px 9px', background: on ? 'var(--okB)' : 'var(--muB)', color: on ? 'var(--okT)' : 'var(--muT)', flex: 'none', whiteSpace: 'nowrap' }}>
      {on ? onLabel : offLabel}
    </span>
  );
}
