import { useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { canvasRef } from '../lib/refs';
import { effDates, visRows } from '../lib/gantt';
import { ppdFor, rowHFor, stMeta } from '../lib/meta';
import { fmt } from '../lib/dates';

function applyDelta(id: string, mode: string, dd: number, withKids: boolean) {
  const st = useStore.getState();
  const ids = new Set([id]);
  if (withKids) st.desc(id).forEach((k) => ids.add(k.id));
  const changed: { id: string; s: number; e: number }[] = [];
  const tasks = st.tasks.map((t) => {
    // never coerce unscheduled tasks onto the timeline via a parent move
    if (!ids.has(t.id) || t.s == null || t.e == null) return t;
    let s = t.s ?? 0, e = t.e ?? 0;
    if (mode === 'move') { s = s + dd; e = e + dd; }
    else if (mode === 'l') { s = Math.min(s + dd, e); }
    else { e = Math.max(e + dd, s); }
    changed.push({ id: t.id, s, e });
    return { ...t, s, e };
  });
  st.set({ tasks });
  changed.forEach((c) => api.updateTask(c.id, { s: c.s, e: c.e }).catch(() => {}));
}

// Global pointer/keyboard interactions shared across Gantt/Board/Calendar/Workload.
export function useInteractions() {
  useEffect(() => {
    const ppd = () => ppdFor(useStore.getState().zoom);
    const rowH = () => rowHFor(useStore.getState().density);

    const onMM = (e: MouseEvent) => {
      const st = useStore.getState();
      if (st.drag) {
        const dd = Math.round((e.clientX - st.drag.x0) / ppd());
        if (dd !== st.drag.dd) st.set({ drag: { ...st.drag, dd, moved: st.drag.moved || dd !== 0 } });
      } else if (st.depDraw) {
        const c = canvasRef.current;
        if (c) { const r = c.getBoundingClientRect(); st.set({ depDraw: { ...st.depDraw, x: e.clientX - r.left, y: e.clientY - r.top } }); }
      } else if ((st as any).bdrag && (st as any).bdrag.on) {
        st.set({ bdrag: { ...(st as any).bdrag, x: e.clientX, y: e.clientY, moved: true } } as any);
      } else if ((st as any).cdrag) {
        st.set({ cdrag: { ...(st as any).cdrag, x: e.clientX, y: e.clientY, moved: true } } as any);
      } else if ((st as any).wldrag) {
        st.set({ wldrag: { ...(st as any).wldrag, x: e.clientX, y: e.clientY, moved: true } } as any);
      }
    };

    const onMU = (e: MouseEvent) => {
      const st = useStore.getState();
      if (st.drag) {
        const d = st.drag, t = st.task(d.id);
        if (!d.moved || !d.dd) { st.set({ drag: null, selId: d.id }); return; }
        const kids = t ? st.desc(d.id) : [];
        if (d.mode === 'move' && kids.length && st.parentPref === 'ask') {
          const rows = visRows(st.tasks, st.projectId, st.collapsed, st.statusFilter);
          const idx = rows.findIndex((x) => x.t.id === d.id);
          const eff = effDates(t!, d, null);
          st.set({ drag: null, pend: { id: d.id, dd: d.dd }, pp: { id: d.id, dd: d.dd, n: kids.length, x: Math.max(8, eff.s * ppd() + 30), y: (idx + 1) * rowH() + 6 } });
        } else if (d.mode === 'move' && kids.length) {
          applyDelta(d.id, 'move', d.dd, st.parentPref === 'together');
          st.set({ drag: null });
        } else {
          applyDelta(d.id, d.mode, d.dd, false);
          st.set({ drag: null });
        }
        return;
      }
      if (st.depDraw) {
        const c = canvasRef.current;
        if (c) {
          const r = c.getBoundingClientRect();
          const y = e.clientY - r.top;
          const rows = visRows(st.tasks, st.projectId, st.collapsed, st.statusFilter);
          const idx = Math.floor(y / rowH());
          const target = rows[idx] && rows[idx].t;
          if (target && target.id !== st.depDraw.from) {
            const from = st.depDraw.from;
            // validate: no duplicates, no parent/child links, no cycles
            const dup = target.deps.some((d) => d.t === from);
            const related = (() => {
              const anc = (id: string, of: string) => { let w = st.task(of)?.par; while (w) { if (w === id) return true; w = st.task(w)?.par ?? null; } return false; };
              return anc(from, target.id) || anc(target.id, from);
            })();
            const createsCycle = (() => {
              const seen = new Set<string>();
              const walk = (id: string): boolean => {
                if (id === target.id) return true;
                if (seen.has(id)) return false;
                seen.add(id);
                return (st.task(id)?.deps ?? []).some((d) => walk(d.t));
              };
              return walk(from);
            })();
            if (dup) { st.pushToast('Dependency already exists'); st.set({ depDraw: null }); return; }
            if (related) { st.pushToast('Cannot link a task to its own parent/subtask', 'bad'); st.set({ depDraw: null }); return; }
            if (createsCycle) { st.pushToast('Cannot add dependency — it would create a cycle', 'bad'); st.set({ depDraw: null }); return; }
            st.set({ tasks: st.tasks.map((t) => (t.id === target.id ? { ...t, deps: [...t.deps, { t: from }] } : t)), depDraw: null });
            api.updateTask(target.id, { deps: [...target.deps, { t: from }] }).catch(() => {
              st.set({ tasks: useStore.getState().tasks.map((t) => (t.id === target.id ? { ...t, deps: t.deps.filter((d) => d.t !== from) } : t)) });
              st.pushToast('Dependency not saved', 'bad');
            });
            st.pushToast('Dependency added: ' + st.task(from)!.name + ' → ' + target.name);
            return;
          }
        }
        st.set({ depDraw: null });
        return;
      }
      // board drag
      if ((st as any).bdrag && (st as any).bdrag.on) {
        const bd = (st as any).bdrag;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const col = el?.closest?.('[data-col]');
        if (col && bd.moved) {
          const ns = col.getAttribute('data-col')!;
          const t = st.task(bd.id);
          if (t && t.st !== ns) {
            st.updateTask(t.id, { st: ns, pg: ns === 'done' ? 100 : t.pg });
            st.pushToast(`"${t.name}" → ${stMeta(ns).l}`);
          }
        }
        st.set({ bdrag: null } as any);
        return;
      }
      // calendar drag
      if ((st as any).cdrag) {
        const cd = (st as any).cdrag;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cell = el?.closest?.('[data-day]');
        if (cell && cd.moved) {
          const nd = parseInt(cell.getAttribute('data-day')!, 10);
          const t = st.task(cd.id);
          if (t && t.s != null && t.e != null) {
            const dur = t.e - t.s;
            st.updateTask(t.id, { s: nd - dur, e: nd });
            st.pushToast(`"${t.name}" rescheduled to ${fmt(nd)}`);
          } else if (t) {
            // unscheduled tray item → schedule it on the dropped date
            st.updateTask(t.id, { s: nd, e: nd });
            st.pushToast(`"${t.name}" scheduled for ${fmt(nd)}`);
          }
        }
        st.set({ cdrag: null } as any);
        return;
      }
      // workload drag
      if ((st as any).wldrag) {
        const wd = (st as any).wldrag;
        const el = document.elementFromPoint(e.clientX, e.clientY);
        const cell = el?.closest?.('[data-person]');
        if (cell && wd.moved) {
          const np = cell.getAttribute('data-person')!;
          if (np && np !== wd.p) {
            const wl = { ...st.workload };
            wl[wd.p] = [...wl[wd.p]]; wl[np] = [...wl[np]];
            wl[wd.p][wd.w] -= wd.h; wl[np][wd.w] += wd.h;
            const t = st.task(wd.id);
            st.set({ workload: wl });
            if (t) st.updateTask(t.id, { a: np });
            st.pushToast('Reassigned to ' + st.members[np].n);
          }
        }
        st.set({ wldrag: null } as any);
      }
    };

    const onKD = (e: KeyboardEvent) => {
      const st = useStore.getState();
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) { e.preventDefault(); st.set((s) => ({ palette: !s.palette, palQ: '', palIdx: 0 })); return; }
      if (e.key === 'Escape' && st.present) { st.set({ present: false }); return; }
      if (e.key === 'Escape') st.set({ palette: false, quickAdd: false, cellMenu: null, notifOpen: false, avMenu: false, wsMenu: false, shareOpen: false, viewsOpen: false, filterOpen: false, colMenu: false, pp: null, pend: null, depDraw: null, drag: null, bdrag: null, cdrag: null, wldrag: null, soId: null, onb: null } as any);
    };

    window.addEventListener('mousemove', onMM);
    window.addEventListener('mouseup', onMU);
    window.addEventListener('keydown', onKD);
    const rz = () => {
      const w = window.innerWidth;
      const st = useStore.getState();
      if (w < 1080 && !st.sb && !(window as any).__userSb) st.set({ sb: true });
    };
    window.addEventListener('resize', rz);
    setTimeout(rz, 50);
    return () => {
      window.removeEventListener('mousemove', onMM);
      window.removeEventListener('mouseup', onMU);
      window.removeEventListener('keydown', onKD);
      window.removeEventListener('resize', rz);
    };
  }, []);
}
