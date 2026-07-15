import { useEffect } from 'react';
import { useStore } from './store';
import { Login } from './screens/Login';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { ProjectScreen } from './screens/ProjectScreen';
import { Home } from './screens/Home';
import { MyTasks } from './screens/MyTasks';
import { Inbox } from './screens/Inbox';
import { Goals } from './screens/Goals';
import { Chat } from './screens/Chat';
import { AiPage } from './screens/AiPage';
import { Settings } from './screens/Settings';
import { Admin } from './screens/Admin';
import { Trash } from './screens/Trash';
import { Reports } from './screens/Reports';
import { SlideOver } from './components/SlideOver';
import { AiPanel } from './components/AiPanel';
import { CommandPalette } from './components/CommandPalette';
import { QuickAdd } from './components/QuickAdd';
import { Onboarding } from './components/Onboarding';
import { Toasts } from './components/Toasts';
import { Present } from './screens/Present';
import { useInteractions } from './hooks/useInteractions';
import { useRealtime } from './hooks/useRealtime';

function useThemeAttr() {
  const theme = useStore((s) => s.theme);
  const sysDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  return theme === 'system' ? (sysDark ? 'dark' : 'light') : theme;
}

export function App() {
  const ready = useStore((s) => s.ready);
  const authed = useStore((s) => s.authed);
  const bootstrap = useStore((s) => s.bootstrap);
  const accent = useStore((s) => s.accent);
  const themeAttr = useThemeAttr();

  useEffect(() => { bootstrap(); }, [bootstrap]);

  if (!ready) {
    return (
      <div data-vtheme="light" data-vaccent={accent} style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
        <svg style={{ animation: 'vspin .8s linear infinite' }} width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="var(--acc)" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
      </div>
    );
  }

  if (!authed) {
    return (
      <div data-vtheme={themeAttr} data-vaccent={accent} style={{ position: 'fixed', inset: 0 }}>
        <Login />
        <Toasts />
      </div>
    );
  }

  return (
    <div data-vtheme={themeAttr} data-vaccent={accent}>
      <Shell />
      <Present />
    </div>
  );
}

function Shell() {
  const closeMenus = useStore((s) => s.set);
  const screen = useStore((s) => s.screen);
  useInteractions();
  useRealtime();
  // phones/small tablets: the sidebar becomes an off-canvas drawer (see Sidebar)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 759px)');
    const apply = () => useStore.getState().set({ mobile: mq.matches, mobNav: false });
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);
  const drawerOpen = useStore((s) => s.mobile && s.mobNav);

  return (
    <div
      onMouseDown={() => closeMenus({ wsMenu: false, notifOpen: false, avMenu: false, shareOpen: false, viewsOpen: false, filterOpen: false, colMenu: false, cellMenu: null, projMenuOpen: false })}
      style={{ position: 'fixed', inset: 0, display: 'flex', background: 'var(--bg)', color: 'var(--txt)', fontSize: 14, overflow: 'hidden', fontFamily: 'Inter, system-ui, sans-serif' }}
    >
      <Sidebar />
      {drawerOpen && <div onMouseDown={() => closeMenus({ mobNav: false })} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,.45)', zIndex: 88, animation: 'vfade .18s ease' }} />}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0 }}>
        <Topbar />
        {screen === 'project' && <ProjectScreen />}
        {screen === 'home' && <Home />}
        {screen === 'mytasks' && <MyTasks />}
        {screen === 'inbox' && <Inbox />}
        {screen === 'goals' && <Goals />}
        {screen === 'chat' && <Chat />}
        {screen === 'ai' && <AiPage />}
        {screen === 'settings' && <Settings />}
        {screen === 'admin' && <Admin />}
        {screen === 'trash' && <Trash />}
        {screen === 'reports' && <Reports />}
      </div>
      <SlideOver />
      <AiPanel />
      <CommandPalette />
      <QuickAdd />
      <Onboarding />
      <Toasts />
    </div>
  );
}
