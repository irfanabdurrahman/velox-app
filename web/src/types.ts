export type Member = { n: string; c: string; role: string; email: string };
export type Workspace = { id: string; name: string; color: string; ini: string; meta: string };
export type Category = { id: string; label: string };
export type Project = {
  id: string; name: string; code: string; cat: string; ws: string;
  owner: string; st: string; prog: number; due: number | null; color: string;
  privacy?: string; shareToken?: string | null;
};
export type Dep = { t: string; type?: 'FS' | 'SS' | 'FF' | 'SF'; lag?: number; crit?: boolean };
export type ChecklistItem = { id: string; txt: string; done: boolean };
export type Task = {
  id: string; pid: string; par: string | null; name: string; a: string | null;
  pr: string; pg: number; st: string; s: number | null; e: number | null;
  ms: boolean; crit: boolean; bs?: number | null; be?: number | null;
  lbl: string[]; deps: Dep[]; est?: string | null; tt?: string | null;
  descr?: string; checklist?: ChecklistItem[]; cf?: Record<string, any>;
  sectionId?: string | null; recurrence?: string | null; ord?: number;
  a2?: string[]; watchers?: string[]; homes?: string[];
};
export type Section = { id: string; pid: string; name: string; ord: number };
export type CustomField = { id: string; pid: string; name: string; kind: string; config: any; ord: number };
export type StatusUpdatePost = { id: string; pid: string; author: string | null; status: string; summary: string; when: string };
export type Comment = { id: string; who: string; when: string; txt: string; rx: [string, number][] };
export type FileItem = { id?: string; n: string; s: string; k: string };
export type Notif = {
  id: string; kind: string; ic: string; unread: boolean; when: string;
  txt: string; ref: string | null; who?: string | null; go?: string | null;
};
export type ChatChannel = { id: string; kind: string; name: string };
export type ChatMsg = { who: string; when: string; txt: string; ref?: string | null };
export type User = { id: string; email: string; name: string; initials: string; color: string };

export type Screen =
  | 'project' | 'home' | 'mytasks' | 'inbox' | 'goals' | 'chat' | 'ai'
  | 'settings' | 'admin' | 'trash' | 'reports';
export type View = 'gantt' | 'list' | 'board' | 'calendar' | 'workload' | 'pdash';
export type Zoom = 'day' | 'week' | 'month' | 'qtr';
export type Theme = 'light' | 'dark' | 'system';
