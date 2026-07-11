import { useStore } from '../store';
import { Hover } from './Hover';
import { notifVM } from '../lib/notif';
import { t, useLang } from '../lib/i18n';

export function Topbar() {
  const s = useStore();
  useLang(); // re-render on language switch
  const unread = s.inbox.filter((n) => n.unread).length;
  const u = s.user;
  const myRole = s.myRoles[s.ws] || '';
  const roleLabel = myRole ? myRole.split('_').map((w) => w.charAt(0) + w.slice(1).toLowerCase()).join(' ') : '';
  // Presence — user ids currently connected to the active workspace.
  const online = (s.online[s.ws] || []).filter((id) => s.members[id]);
  const meOnline = !!(u && online.includes(u.id));
  const onlineCluster = online.filter((id) => id !== u?.id).slice(0, 4);

  return (
    <div style={{ height: 50, flex: 'none', background: 'var(--panel)', borderBottom: '1px solid var(--line)', display: 'flex', alignItems: 'center', gap: 10, padding: '0 14px', zIndex: 25, position: 'relative' }}>
      <Hover onClick={() => s.set({ palette: true, palQ: '', palIdx: 0 })} style={{ width: 340, maxWidth: '34vw', display: 'flex', alignItems: 'center', gap: 8, background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 9, padding: '6.5px 11px', color: 'var(--txt3)', fontSize: 12.5, cursor: 'pointer' }} hover={{ border: '1px solid var(--txt3)' }}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
        <span style={{ flex: 1 }}>{t('search.placeholder')}</span>
        <span style={{ fontSize: 9.5, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 5, padding: '1px 5px', color: 'var(--txt3)', fontWeight: 600 }}>⌘K</span>
      </Hover>

      <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8 }} onMouseDown={(e) => e.stopPropagation()}>
        {online.length > 0 && (
          <div title={online.map((id) => s.members[id]?.n || id).join(', ')} style={{ display: 'flex', alignItems: 'center', gap: 7, marginRight: 2 }}>
            <span style={{ display: 'flex' }}>
              {onlineCluster.map((id, i) => (
                <span key={id} style={{ width: 22, height: 22, borderRadius: '50%', background: s.members[id]?.c || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800, border: '2px solid var(--panel)', marginLeft: i === 0 ? 0 : -7, position: 'relative' }}>{id}</span>
              ))}
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, fontWeight: 700, color: 'var(--okT)' }}>
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--ok)', flex: 'none' }} />
              {online.length} {t('presence.online')}
            </span>
          </div>
        )}
        <Hover onClick={() => s.set((x) => ({ quickAdd: !x.quickAdd, qaText: '', qaPreview: null }))} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--acc)', color: '#fff', fontSize: 12, fontWeight: 600, borderRadius: 9, padding: '7px 13px', cursor: 'pointer', boxShadow: '0 1px 3px var(--ring)', transition: 'transform .15s' }} hover={{ transform: 'translateY(-1px)' }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>{t('action.quickadd')}
        </Hover>

        <Hover onClick={() => s.set((x) => ({ aiPanel: !x.aiPanel }))} title="Velox AI" style={{ width: 31, height: 31, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer', background: s.aiPanel ? 'var(--accS)' : 'transparent', color: s.aiPanel ? 'var(--accT)' : 'var(--txt2)', border: '1px solid var(--line)' }} hover={{ background: 'var(--accS)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>
        </Hover>

        {/* notifications */}
        <div style={{ position: 'relative' }}>
          <Hover onClick={() => s.set((x) => ({ notifOpen: !x.notifOpen, avMenu: false }))} style={{ width: 31, height: 31, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--txt2)', border: '1px solid var(--line)' }} hover={{ background: 'var(--hover)' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.7 21a2 2 0 0 1-3.4 0" /></svg>
          </Hover>
          {unread > 0 && <span style={{ position: 'absolute', top: -4, right: -4, minWidth: 15, height: 15, borderRadius: 99, background: 'var(--tdy)', color: '#fff', fontSize: 8.5, fontWeight: 800, display: 'grid', placeItems: 'center', padding: '0 3px', border: '2px solid var(--panel)' }}>{unread}</span>}
          {s.notifOpen && (
            <div style={{ position: 'absolute', top: 38, right: 0, width: 340, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh3)', zIndex: 70, animation: 'vpop .16s ease', overflow: 'hidden' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 13px 8px' }}><span style={{ fontSize: 12.5, fontWeight: 700 }}>Notifications</span><span onClick={() => s.markAllRead()} style={{ fontSize: 11, color: 'var(--accT)', cursor: 'pointer', fontWeight: 600 }}>Mark all read</span></div>
              {s.inbox.slice(0, 4).map((n) => {
                const vm = notifVM(n);
                return (
                  <Hover key={n.id} onClick={() => { s.markRead(n.id); if (n.ref) s.openTask(n.ref); else if (n.go) s.setView(n.go as any); s.set({ notifOpen: false }); }} style={{ display: 'flex', gap: 9, padding: '9px 13px', cursor: 'pointer', borderTop: '1px solid var(--line2)' }} hover={{ background: 'var(--hover)' }}>
                    <span style={{ width: 26, height: 26, borderRadius: 8, background: vm.icBg, color: vm.icCo, display: 'grid', placeItems: 'center', flex: 'none', fontSize: 10, fontWeight: 800 }}>{n.ic}</span>
                    <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 11.5, color: 'var(--txt)', lineHeight: 1.35 }}>{n.txt}</div><div style={{ fontSize: 10, color: 'var(--txt3)', marginTop: 2 }}>{n.when}</div></div>
                    {n.unread && <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--acc)', flex: 'none', marginTop: 4 }} />}
                  </Hover>
                );
              })}
              <Hover onClick={() => s.go('inbox')} style={{ padding: '9px 13px', textAlign: 'center', fontSize: 11.5, fontWeight: 600, color: 'var(--accT)', cursor: 'pointer', borderTop: '1px solid var(--line2)' }} hover={{ background: 'var(--hover)' }}>Open Inbox</Hover>
            </div>
          )}
        </div>

        {/* theme toggle */}
        <Hover onClick={() => s.cycleTheme()} title={`Theme: ${s.theme}`} style={{ width: 31, height: 31, borderRadius: 9, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--txt2)', border: '1px solid var(--line)' }} hover={{ background: 'var(--hover)' }}>
          {s.theme === 'light' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>}
          {s.theme === 'dark' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>}
          {s.theme === 'system' && <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="20" height="13" rx="2" /><path d="M8 21h8M12 17v4" /></svg>}
        </Hover>

        {/* avatar menu */}
        <div style={{ position: 'relative' }}>
          <div onClick={() => s.set((x) => ({ avMenu: !x.avMenu, notifOpen: false }))} style={{ width: 31, height: 31, borderRadius: '50%', background: u?.color || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 800, cursor: 'pointer', border: '2px solid var(--panel)', boxShadow: 'var(--sh1)' }}>{u?.initials || 'BS'}</div>
          {meOnline && <span title={t('presence.online')} style={{ position: 'absolute', bottom: -1, right: -1, width: 9, height: 9, borderRadius: '50%', background: 'var(--ok)', border: '2px solid var(--panel)' }} />}
          {s.avMenu && (
            <div style={{ position: 'absolute', top: 38, right: 0, width: 230, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 13, boxShadow: 'var(--sh3)', zIndex: 70, animation: 'vpop .16s ease', padding: 5 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 9px 10px', borderBottom: '1px solid var(--line2)', marginBottom: 4 }}>
                <span style={{ width: 32, height: 32, borderRadius: '50%', background: u?.color || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 800 }}>{u?.initials || 'BS'}</span>
                <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{u?.name}</div><div style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{u?.email}{roleLabel ? ' · ' + roleLabel : ''}</div></div>
              </div>
              <Hover onClick={() => s.go('mytasks')} style={{ padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>{t('nav.mytasks')}</Hover>
              <Hover onClick={() => s.set({ onb: { step: 1, wsName: '', invites: [], desc: '', wbs: null, mode: null, busy: false }, avMenu: false })} style={{ padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>Setup guide</Hover>
              <Hover onClick={() => s.go('settings')} style={{ padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>{t('nav.settings')}</Hover>
              <div style={{ height: 1, background: 'var(--line2)', margin: '4px 2px' }} />
              <Hover onClick={() => s.signOut()} style={{ padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--bdT)' }} hover={{ background: 'var(--bdB)' }}>{t('action.signout')}</Hover>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
