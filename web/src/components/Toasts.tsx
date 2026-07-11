import { useStore } from '../store';

export function Toasts() {
  const toasts = useStore((s) => s.toasts);
  return (
    <div style={{ position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)', display: 'flex', flexDirection: 'column', gap: 8, zIndex: 200, alignItems: 'center', pointerEvents: 'none' }}>
      {toasts.map((t) => (
        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 9, background: t.kind === 'bad' ? 'var(--bd)' : '#27272A', color: '#fff', border: '1px solid var(--line)', padding: '10px 15px', borderRadius: 10, fontSize: 12.5, fontWeight: 500, boxShadow: 'var(--sh3)', animation: 'vup .2s ease' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
          {t.txt}
        </div>
      ))}
    </div>
  );
}
