import { useStore } from '../store';
import { t, useLang } from '../lib/i18n';

// Mobile-only bottom tab bar: thumb-reachable navigation + a central quick-add.
// Sits under the slide-over (z 40) and drawer (z 90) so overlays still win.
export function BottomNav() {
  const s = useStore();
  useLang();
  if (!s.mobile) return null;
  const unread = s.inbox.filter((n) => n.unread).length;

  const item = (key: string, label: string, icon: JSX.Element, onClick: () => void, badge?: number) => {
    const on = s.screen === key && !s.mobNav;
    return (
      <div onClick={onClick} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '7px 0 5px', cursor: 'pointer', color: on ? 'var(--accT)' : 'var(--txt3)', position: 'relative', userSelect: 'none' }}>
        {icon}
        <span style={{ fontSize: 9.5, fontWeight: on ? 700 : 500, whiteSpace: 'nowrap' }}>{label}</span>
        {!!badge && badge > 0 && (
          <span style={{ position: 'absolute', top: 3, left: '50%', marginLeft: 6, minWidth: 15, height: 15, borderRadius: 99, background: 'var(--tdy)', color: '#fff', fontSize: 8.5, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 3px', border: '2px solid var(--panel)' }}>{badge}</span>
        )}
      </div>
    );
  };

  return (
    <div style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 35, background: 'var(--panel)', borderTop: '1px solid var(--line)', display: 'flex', alignItems: 'stretch', paddingBottom: 'env(safe-area-inset-bottom)', boxShadow: '0 -1px 8px rgba(15,23,42,.05)' }} onMouseDown={(e) => e.stopPropagation()}>
      {item('home', t('nav.home'), (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>
      ), () => s.go('home'))}
      {item('mytasks', t('nav.mytasks'), (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>
      ), () => s.go('mytasks'))}
      <div onClick={() => s.set((x) => ({ quickAdd: !x.quickAdd, qaText: '', mobNav: false }))} style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', userSelect: 'none' }}>
        <span style={{ width: 42, height: 42, marginTop: -14, borderRadius: '50%', background: 'var(--acc)', color: '#fff', display: 'grid', placeItems: 'center', boxShadow: '0 3px 10px var(--ring)', border: '3px solid var(--panel)' }}>
          <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
        </span>
      </div>
      {item('inbox', t('nav.inbox'), (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
      ), () => s.go('inbox'), unread)}
      {item('__menu', t('nav.menu'), (
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
      ), () => s.set({ mobNav: true }))}
    </div>
  );
}
