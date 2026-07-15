import { useStore } from '../store';
import { Hover } from './Hover';
import { dotFor } from '../lib/meta';
import { TODAY } from '../lib/dates';
import { t, useLang } from '../lib/i18n';

export function Sidebar() {
  const s = useStore();
  useLang(); // re-render on language switch
  const mini = s.sb;
  const sbW = mini ? 58 : 236;
  const sbLbl = mini ? 0 : 1;
  const ws = s.workspaces.find((w) => w.id === s.ws) || s.workspaces[0];
  if (!ws) return null;
  const wsProjects = s.projects.filter((p) => p.ws === s.ws);
  const unread = s.inbox.filter((n) => n.unread).length;
  const myDueN = s.tasks.filter((t) => t.a === s.user?.id && t.st !== 'done' && t.e != null && t.e <= TODAY).length;
  const readOnly = ['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws] || '');
  const isAdmin = ['OWNER', 'ADMIN'].includes(s.myRoles[s.ws] || '');
  const isManagerPlus = ['OWNER', 'ADMIN', 'MANAGER'].includes(s.myRoles[s.ws] || '');

  const nav = (on: boolean) => ({ background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)', fontWeight: on ? 600 : 500 } as const);
  const navItem = (key: string, label: string, icon: JSX.Element, badge?: { n: number; danger?: boolean }, onClick?: () => void) => {
    const on = s.screen === key;
    return (
      <Hover onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 31, padding: '0 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, marginBottom: 1, ...nav(on) }} hover={{ background: on ? 'var(--accS)' : 'var(--hover)' }}>
        <span style={{ flex: 'none', display: 'grid' }}>{icon}</span>
        <span style={{ flex: 1, opacity: sbLbl, transition: 'opacity .15s', whiteSpace: 'nowrap' }}>{label}</span>
        {badge && badge.n > 0 && (
          <span style={{ fontSize: 9.5, fontWeight: 700, background: badge.danger ? 'var(--bdB)' : 'var(--acc)', color: badge.danger ? 'var(--bdT)' : '#fff', borderRadius: 99, padding: '1px 6px', opacity: sbLbl }}>{badge.n}</span>
        )}
      </Hover>
    );
  };

  return (
    <div style={{ width: sbW, flex: 'none', background: 'var(--panel)', borderRight: '1px solid var(--line)', display: 'flex', flexDirection: 'column', transition: 'width .18s cubic-bezier(.4,0,.2,1)', overflow: 'hidden', zIndex: 30 }}>
      {/* logo */}
      <div style={{ padding: '12px 10px 8px', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
        <div style={{ width: 26, height: 26, borderRadius: 7, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center', flex: 'none', boxShadow: 'var(--sh1)' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l7 8-7 8" /><path d="M13 4l7 8-7 8" /></svg>
        </div>
        <span style={{ fontSize: 17, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-.035em', color: 'var(--txt)', opacity: sbLbl, transition: 'opacity .15s', whiteSpace: 'nowrap' }}>velox</span>
      </div>

      {/* workspace switcher */}
      <div onMouseDown={(e) => e.stopPropagation()} style={{ padding: '0 8px 6px', flex: 'none', position: 'relative' }}>
        <Hover onClick={() => s.set((x) => ({ wsMenu: !x.wsMenu, sb: x.wsMenu ? x.sb : false }))} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 7px', borderRadius: 9, cursor: 'pointer', border: '1px solid var(--line)' }} hover={{ background: 'var(--hover)' }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: ws.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, flex: 'none' }}>{ws.ini}</span>
          <span style={{ fontSize: 12.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', opacity: sbLbl, transition: 'opacity .15s', flex: 1 }}>{ws.name}</span>
          <svg style={{ opacity: sbLbl, flex: 'none' }} width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2.5"><path d="M7 9l5-5 5 5M7 15l5 5 5-5" /></svg>
        </Hover>
        {s.wsMenu && <WsMenu />}
      </div>

      {/* nav */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '2px 8px 8px' }}>
        {navItem('home', t('nav.home'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>, undefined, () => s.go('home'))}
        {navItem('mytasks', t('nav.mytasks'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>, { n: myDueN, danger: true }, () => s.go('mytasks'))}
        {navItem('inbox', t('nav.inbox'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>, { n: unread }, () => s.go('inbox'))}
        {navItem('goals', t('nav.goals'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1.5" fill="currentColor" /></svg>, undefined, () => s.go('goals'))}
        {navItem('chat', t('nav.chat'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>, undefined, () => s.go('chat'))}
        {navItem('ai', t('nav.ai'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" /></svg>, undefined, () => s.go('ai'))}
        {navItem('reports', t('nav.reports'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 16v-5M12 16V8M17 16v-4" /></svg>, undefined, () => s.go('reports'))}
        {isManagerPlus && navItem('trash', t('nav.trash'), <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /><path d="M10 11v6M14 11v6" /></svg>, undefined, () => s.go('trash'))}

        {!mini && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 4px 4px 8px' }}>
              <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em' }}>{t('nav.projects')}</span>
              {!readOnly && (
                <Hover onClick={() => s.set({ onb: { step: 3, wsName: '', invites: [], desc: '', wbs: null, mode: null, busy: false, newProj: true } })} title={t('action.newProject')} style={{ width: 22, height: 22, borderRadius: 7, display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--accT)', background: 'var(--accS)' }} hover={{ background: 'var(--acc)', color: '#fff' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                </Hover>
              )}
            </div>
            {wsProjects.length === 0 && (
              <div style={{ margin: '6px 2px', padding: '14px 10px', border: '1px dashed var(--line)', borderRadius: 10, textAlign: 'center' }}>
                <div style={{ fontSize: 11.5, color: 'var(--txt2)', fontWeight: 500, marginBottom: readOnly ? 0 : 8 }}>{t('empty.projects')}</div>
                {!readOnly && (
                  <span onClick={() => s.set({ onb: { step: 3, newProj: true } })} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--acc)', borderRadius: 7, padding: '5px 10px', cursor: 'pointer' }}>＋ {t('action.createProject')}</span>
                )}
              </div>
            )}
            {s.categories.map((c) => {
              const ps = wsProjects.filter((p) => p.cat === c.id);
              if (!ps.length) return null;
              const open = !!s.openCats[c.id];
              return (
                <div key={c.id}>
                  <Hover onClick={() => s.set((x) => ({ openCats: { ...x.openCats, [c.id]: !x.openCats[c.id] } }))} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 27, padding: '0 8px', borderRadius: 7, cursor: 'pointer', color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>
                    <svg style={{ flex: 'none', transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform .15s' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
                    <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.label}</span>
                    <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{ps.length}</span>
                  </Hover>
                  {open && ps.map((p) => {
                    const act = s.screen === 'project' && s.projectId === p.id;
                    return (
                      <Hover key={p.id} onClick={() => s.set({ screen: 'project', projectId: p.id, selId: null, soId: null })} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 29, padding: '0 8px 0 24px', borderRadius: 7, cursor: 'pointer', background: act ? 'var(--accS)' : 'transparent', color: act ? 'var(--accT)' : 'var(--txt2)', fontWeight: act ? 600 : 400 }} hover={{ background: act ? 'var(--accS)' : 'var(--hover)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flex: 'none' }} />
                        <span style={{ flex: 1, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotFor(p.st), flex: 'none' }} />
                      </Hover>
                    );
                  })}
                </div>
              );
            })}
            {(() => {
              const uncatPs = wsProjects.filter((p) => !p.cat);
              if (!uncatPs.length) return null;
              const open = !!s.openCats.__uncat;
              return (
                <div>
                  <Hover onClick={() => s.set((x) => ({ openCats: { ...x.openCats, __uncat: !x.openCats.__uncat } }))} style={{ display: 'flex', alignItems: 'center', gap: 6, height: 27, padding: '0 8px', borderRadius: 7, cursor: 'pointer', color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>
                    <svg style={{ flex: 'none', transform: `rotate(${open ? 90 : 0}deg)`, transition: 'transform .15s' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M9 6l6 6-6 6" /></svg>
                    <span style={{ flex: 1, fontSize: 11.5, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Uncategorized</span>
                    <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{uncatPs.length}</span>
                  </Hover>
                  {open && uncatPs.map((p) => {
                    const act = s.screen === 'project' && s.projectId === p.id;
                    return (
                      <Hover key={p.id} onClick={() => s.set({ screen: 'project', projectId: p.id, selId: null, soId: null })} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 29, padding: '0 8px 0 24px', borderRadius: 7, cursor: 'pointer', background: act ? 'var(--accS)' : 'transparent', color: act ? 'var(--accT)' : 'var(--txt2)', fontWeight: act ? 600 : 400 }} hover={{ background: act ? 'var(--accS)' : 'var(--hover)' }}>
                        <span style={{ width: 8, height: 8, borderRadius: 3, background: p.color, flex: 'none' }} />
                        <span style={{ flex: 1, fontSize: 12, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: dotFor(p.st), flex: 'none' }} />
                      </Hover>
                    );
                  })}
                </div>
              );
            })()}
            {!readOnly && (
              <Hover onClick={() => s.set({ onb: { step: 3, newProj: true } })} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 30, padding: '0 8px 0 10px', borderRadius: 8, cursor: 'pointer', color: 'var(--accT)', fontSize: 12, fontWeight: 600, marginTop: 3 }} hover={{ background: 'var(--accS)' }}>
                <span style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px dashed var(--accT)', display: 'grid', placeItems: 'center', fontSize: 11, lineHeight: 1, flex: 'none' }}>＋</span>
                <span style={{ whiteSpace: 'nowrap' }}>{t('action.newProject')}</span>
              </Hover>
            )}
          </>
        )}
      </div>

      {/* footer */}
      <div style={{ flex: 'none', padding: 8, borderTop: '1px solid var(--line)' }}>
        {isAdmin && s.adminView === 'admin' && (
          <Hover onClick={() => s.go('admin')} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 30, padding: '0 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, ...nav(s.screen === 'admin') }} hover={{ background: 'var(--hover)' }}>
            <svg style={{ flex: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></svg>
            <span style={{ flex: 1, opacity: sbLbl, whiteSpace: 'nowrap' }}>{t('nav.admin')}</span>
            <span style={{ fontSize: 8.5, fontWeight: 700, color: 'var(--txt3)', border: '1px solid var(--line)', borderRadius: 4, padding: '1px 4px', opacity: sbLbl }}>ADMIN</span>
          </Hover>
        )}
        <Hover onClick={() => s.go('settings')} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 30, padding: '0 8px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, ...nav(s.screen === 'settings') }} hover={{ background: 'var(--hover)' }}>
          <svg style={{ flex: 'none' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></svg>
          <span style={{ opacity: sbLbl, whiteSpace: 'nowrap' }}>{t('nav.settings')}</span>
        </Hover>
        <Hover onClick={() => s.set((x) => ({ sb: !x.sb }))} style={{ display: 'flex', alignItems: 'center', gap: 9, height: 30, padding: '0 8px', borderRadius: 8, cursor: 'pointer', color: 'var(--txt3)', fontSize: 12.5 }} hover={{ background: 'var(--hover)' }}>
          <svg style={{ flex: 'none', transform: `rotate(${mini ? 180 : 0}deg)`, transition: 'transform .2s' }} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 17l-5-5 5-5M18 17l-5-5 5-5" /></svg>
          <span style={{ opacity: sbLbl, whiteSpace: 'nowrap' }}>{t('action.collapse')}</span>
        </Hover>
      </div>
    </div>
  );
}

function WsMenu() {
  const s = useStore();
  return (
    <div style={{ position: 'absolute', top: '100%', left: 8, right: 8, marginTop: 4, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh3)', padding: 5, zIndex: 60, animation: 'vpop .15s ease' }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', padding: '6px 9px 4px' }}>Workspaces</div>
      {s.workspaces.map((w) => (
        <Hover key={w.id} onClick={() => { const first = s.projects.find((p) => p.ws === w.id); s.set({ ws: w.id, wsMenu: false, projectId: first ? first.id : s.projectId, screen: first ? s.screen : 'home' }); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', background: w.id === s.ws ? 'var(--accS)' : 'transparent' }} hover={{ background: 'var(--hover)' }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: w.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, flex: 'none' }}>{w.ini}</span>
          <span style={{ flex: 1, fontSize: 12.5, fontWeight: 600 }}>{w.name}</span>
          <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{w.meta}</span>
          {w.id === s.ws && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--accT)" strokeWidth="3"><path d="M5 13l4 4L19 7" /></svg>}
        </Hover>
      ))}
      <div style={{ height: 1, background: 'var(--line)', margin: '5px 4px' }} />
      <Hover onClick={() => s.set({ onb: { step: 1, wsName: '', invites: [], desc: '', wbs: null, mode: null, busy: false }, wsMenu: false })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 8px', borderRadius: 8, cursor: 'pointer', color: 'var(--txt2)', fontSize: 12.5, fontWeight: 500 }} hover={{ background: 'var(--hover)' }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Create workspace
      </Hover>
    </div>
  );
}
