// Minimal i18n. `t('key')` returns the string for the active language, falling
// back to the key. Language persists to localStorage and is exposed via a tiny
// store subscription so components re-render on switch.
import { useSyncExternalStore } from 'react';

export type Lang = 'en' | 'id';

const dict: Record<string, { en: string; id: string }> = {
  'nav.home': { en: 'Home', id: 'Beranda' },
  'nav.mytasks': { en: 'My Tasks', id: 'Tugas Saya' },
  'nav.inbox': { en: 'Inbox', id: 'Kotak Masuk' },
  'nav.goals': { en: 'Goals', id: 'Sasaran' },
  'nav.chat': { en: 'Chat', id: 'Obrolan' },
  'nav.ai': { en: 'Velox AI', id: 'Velox AI' },
  'nav.projects': { en: 'Projects', id: 'Proyek' },
  'nav.admin': { en: 'Admin', id: 'Admin' },
  'nav.reports': { en: 'Reports', id: 'Laporan' },
  'nav.trash': { en: 'Trash', id: 'Sampah' },
  'nav.settings': { en: 'Settings', id: 'Pengaturan' },
  'action.collapse': { en: 'Collapse', id: 'Ciutkan' },
  'action.close': { en: 'Close', id: 'Tutup' },
  'action.quickadd': { en: 'Quick add', id: 'Tambah cepat' },
  'action.share': { en: 'Share', id: 'Bagikan' },
  'action.newProject': { en: 'New project', id: 'Proyek baru' },
  'action.createProject': { en: 'Create project', id: 'Buat proyek' },
  'action.signout': { en: 'Sign out', id: 'Keluar' },
  'action.save': { en: 'Save', id: 'Simpan' },
  'action.cancel': { en: 'Cancel', id: 'Batal' },
  'action.delete': { en: 'Delete', id: 'Hapus' },
  'tab.gantt': { en: 'Gantt', id: 'Gantt' },
  'tab.list': { en: 'List', id: 'Daftar' },
  'tab.board': { en: 'Board', id: 'Papan' },
  'tab.calendar': { en: 'Calendar', id: 'Kalender' },
  'tab.workload': { en: 'Workload', id: 'Beban Kerja' },
  'tab.dashboard': { en: 'Dashboard', id: 'Dasbor' },
  'status.ok': { en: 'On track', id: 'Sesuai rencana' },
  'status.risk': { en: 'At risk', id: 'Berisiko' },
  'status.bad': { en: 'Off track', id: 'Meleset' },
  'search.placeholder': { en: 'Search tasks, projects, people…', id: 'Cari tugas, proyek, orang…' },
  'empty.mytasks': { en: 'No tasks assigned to you yet', id: 'Belum ada tugas untuk Anda' },
  'empty.mytasks.sub': { en: 'Tasks assigned to you across all projects will show up here.', id: 'Tugas yang ditugaskan kepada Anda di semua proyek akan muncul di sini.' },
  'empty.projects': { en: 'No projects in this workspace yet', id: 'Belum ada proyek di ruang kerja ini' },
  'mytasks.sub': { en: 'across all projects', id: 'di semua proyek' },
  'mytasks.inbox': { en: 'Belum diatur', id: 'Belum diatur' },
  'mytasks.inbox.sub': { en: 'from Quick add — move them to a project', id: 'dari Quick add — pindahkan ke project tujuan' },
  'mytasks.move': { en: 'Move to', id: 'Pindahkan ke' },
  'mytasks.noProjects': { en: 'No projects yet in your workspaces', id: 'Belum ada project di workspace kamu' },
  'mytasks.overdue': { en: 'Overdue', id: 'Terlambat' },
  'mytasks.today': { en: 'Today', id: 'Hari ini' },
  'mytasks.week': { en: 'This week', id: 'Minggu ini' },
  'mytasks.later': { en: 'Later', id: 'Nanti' },
  'presence.online': { en: 'online', id: 'daring' },
};

let lang: Lang = ((): Lang => {
  const v = typeof localStorage !== 'undefined' ? localStorage.getItem('velox-lang') : null;
  return v === 'id' ? 'id' : 'en';
})();

const listeners = new Set<() => void>();
export function setLang(l: Lang) {
  lang = l;
  try { localStorage.setItem('velox-lang', l); } catch { /* ignore */ }
  listeners.forEach((fn) => fn());
}
export const getLang = () => lang;
export function t(key: string): string {
  const entry = dict[key];
  return entry ? entry[lang] : key;
}

// Hook so components re-render when the language changes.
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => { listeners.add(cb); return () => listeners.delete(cb); },
    () => lang,
    () => lang,
  );
}
