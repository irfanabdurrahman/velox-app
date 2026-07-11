import { useEffect, useRef } from 'react';
import { useStore } from '../store';

type PalItem = { ic: string; label: string; meta?: string; icBgC?: string; oC: () => void };
type PalGroup = { label: string; items: PalItem[] };

export function CommandPalette() {
  const s = useStore();
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (s.palette) { const t = setTimeout(() => inputRef.current?.focus(), 30); return () => clearTimeout(t); }
  }, [s.palette]);

  if (!s.palette) return null;

  const set = s.set;
  const q = (s.palQ || '').toLowerCase();

  const openNewProject = () => set({ onb: { step: 3, newProj: true, wsName: '', inv: '', invites: [], desc: '', wbs: null, mode: 'tpl', busy: false }, palette: false, avMenu: false, wsMenu: false });

  const actions: PalItem[] = [
    { ic: '＋', label: 'Create task (Quick add)', meta: 'action', oC: () => set({ palette: false, quickAdd: true, qaText: '' }) },
    { ic: '⧉', label: 'Create project', meta: 'action', oC: () => openNewProject() },
    { ic: '▦', label: 'Go to Executive Dashboard', meta: 'action', oC: () => { set({ palette: false }); s.go('home'); } },
    { ic: '◐', label: 'Toggle theme', meta: 'action', oC: () => { set({ palette: false }); s.cycleTheme(); } },
    { ic: '✦', label: 'Open Velox AI panel', meta: 'action', oC: () => set({ palette: false, aiPanel: true }) },
    { ic: '⚑', label: 'Setup guide (onboarding)', meta: 'action', oC: () => set({ palette: false, onb: { step: 1, wsName: '', inv: '', invites: [], desc: '', wbs: null, mode: null, busy: false } }) },
  ].filter((a) => !q || a.label.toLowerCase().includes(q));

  const projRes: PalItem[] = s.projects.filter((p) => !q || p.name.toLowerCase().includes(q)).slice(0, q ? 5 : 3).map((p) => ({
    ic: p.code, icBgC: p.color, label: p.name, meta: (s.categories.find((c) => c.id === p.cat) || ({} as any)).label,
    oC: () => set({ palette: false, screen: 'project', projectId: p.id }),
  }));

  const taskRes: PalItem[] = q ? s.tasks.filter((x) => x.name.toLowerCase().includes(q)).slice(0, 5).map((x) => ({
    ic: '✓', label: x.name, meta: (s.proj(x.pid) || ({} as any)).name,
    oC: () => { set({ palette: false, screen: 'project', projectId: x.pid }); s.openTask(x.id); },
  })) : [];

  const pplRes: PalItem[] = q ? Object.keys(s.members).filter((k) => s.members[k].n.toLowerCase().includes(q)).slice(0, 3).map((k) => ({
    ic: k, icBgC: s.members[k].c, label: s.members[k].n, meta: s.members[k].role,
    oC: () => { set({ palette: false }); s.pushToast('Profile pages — in the production build'); },
  })) : [];

  const groups: PalGroup[] = [];
  if (taskRes.length) groups.push({ label: 'Tasks', items: taskRes });
  if (projRes.length) groups.push({ label: 'Projects', items: projRes });
  if (pplRes.length) groups.push({ label: 'People', items: pplRes });
  if (actions.length) groups.push({ label: 'Actions', items: actions });

  const flat: PalItem[] = groups.flatMap((g) => g.items);
  // Clamp the stored index against the (possibly shrunken) filtered list:
  // an out-of-range palIdx lands on the last item; an empty list yields 0.
  const idx = Math.max(0, Math.min(s.palIdx, flat.length - 1));
  const empty = groups.length === 0;

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); set({ palIdx: Math.max(0, Math.min(flat.length - 1, idx + 1)) }); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); set({ palIdx: Math.max(0, idx - 1) }); }
    else if (e.key === 'Enter') { e.preventDefault(); if (flat.length) flat[idx]?.oC(); } // Enter on empty results: no-op
  };

  let flatN = -1;
  return (
    <div onMouseDown={() => set({ palette: false })} style={{ position: 'fixed', inset: 0, background: 'rgba(9,10,14,.4)', backdropFilter: 'blur(2px)', zIndex: 90, display: 'flex', justifyContent: 'center', paddingTop: '12vh', animation: 'vfade .12s ease' }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ width: 'min(560px,92vw)', height: 'fit-content', maxHeight: '62vh', background: 'var(--glass)', backdropFilter: 'blur(18px)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--sh3)', overflow: 'hidden', display: 'flex', flexDirection: 'column', animation: 'vpop .16s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '13px 15px', borderBottom: '1px solid var(--line2)' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4-4" /></svg>
          <input ref={inputRef} value={s.palQ} onChange={(e) => set({ palQ: e.target.value, palIdx: 0 })} onKeyDown={onKey} placeholder="Search or jump to… try a task, project, or action" style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 14, color: 'var(--txt)', outline: 'none' }} />
          <span style={{ fontSize: 9.5, background: 'var(--muB)', borderRadius: 5, padding: '2px 6px', color: 'var(--txt3)', fontWeight: 600 }}>ESC</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 6 }}>
          {groups.map((g) => (
            <div key={g.label}>
              <div style={{ fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.08em', padding: '8px 10px 3px' }}>{g.label}</div>
              {g.items.map((i, j) => {
                flatN++;
                const bg = flatN === idx ? 'var(--hover)' : 'transparent';
                const icBg = i.icBgC || 'var(--accS)';
                const icCo = i.icBgC ? '#fff' : 'var(--accT)';
                return (
                  <div key={g.label + j} onClick={i.oC} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7.5px 10px', borderRadius: 9, cursor: 'pointer', background: bg }} onMouseEnter={(e) => { (e.currentTarget as HTMLDivElement).style.background = 'var(--hover)'; }} onMouseLeave={(e) => { (e.currentTarget as HTMLDivElement).style.background = bg; }}>
                    <span style={{ width: 24, height: 24, borderRadius: 7, background: icBg, color: icCo, display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, flex: 'none' }}>{i.ic}</span>
                    <span style={{ flex: 1, fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{i.label}</span>
                    <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{i.meta}</span>
                  </div>
                );
              })}
            </div>
          ))}
          {empty && <div style={{ padding: 22, textAlign: 'center', fontSize: 12.5, color: 'var(--txt3)' }}>No results for "{s.palQ}"</div>}
        </div>
        <div style={{ display: 'flex', gap: 14, padding: '8px 15px', borderTop: '1px solid var(--line2)', fontSize: 10, color: 'var(--txt3)' }}><span><b>↵</b> open</span><span><b>↑↓</b> navigate</span><span><b>⌘K</b> toggle</span></div>
      </div>
    </div>
  );
}
