import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { api } from '../../api';
import { Hover } from '../../components/Hover';
import { stMeta, rowHFor } from '../../lib/meta';
import { fmt, TODAY, EP, dayMs } from '../../lib/dates';
import type { Task } from '../../types';

type Item =
  | { kind: 'hdr'; key: string; gid: string; label: string; count: number; pct: number; isSection?: boolean; secId?: string | null }
  | { kind: 'row'; key: string; t: Task };

type GroupBy = 'section' | 'phase' | 'none';
const GRPS: [GroupBy, string][] = [['section', 'Section'], ['phase', 'Phase'], ['none', 'None']];

export function ListView() {
  const s = useStore();
  const projTasks = s.tasks.filter((t) => t.pid === s.projectId);
  const leafs = projTasks.filter((t) => !t.ms && t.s !== null && !projTasks.some((x) => x.par === t.id));
  const rh = rowHFor(s.density);
  const selIds = Object.keys(s.listSel).filter((k) => s.listSel[k]);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const toggleGroup = (gid: string) => setCollapsed((c) => ({ ...c, [gid]: !c[gid] }));

  const role = s.myRoles[s.ws];
  const canWrite = role !== 'GUEST' && role !== 'EXEC_VIEWER';
  const sectionsForProj = s.sections.filter((x) => x.pid === s.projectId).slice().sort((a, b) => a.ord - b.ord);
  const cfs = s.customFields.filter((f) => f.pid === s.projectId).slice().sort((a, b) => a.ord - b.ord);
  const hasSections = sectionsForProj.length > 0;

  // grouping mode: default Section when the project has sections, else Phase (as before)
  const [groupBy, setGroupBy] = useState<GroupBy | null>(null);
  useEffect(() => { setGroupBy(null); }, [s.projectId]);
  const grp: GroupBy = groupBy ?? (hasSections ? 'section' : 'phase');

  // ---- section management (role-gated) ----
  const [addingSec, setAddingSec] = useState(false);
  const [newSec, setNewSec] = useState('');
  const [editSec, setEditSec] = useState<{ id: string; val: string } | null>(null);
  const addSection = async () => {
    const name = newSec.trim();
    setNewSec('');
    setAddingSec(false);
    if (!name) return;
    try {
      const sec = await api.addSection(s.projectId, name);
      s.set((st) => ({ sections: [...st.sections, sec] }));
    } catch (e: any) { s.pushToast(e?.message || 'Could not add section', 'bad'); }
  };
  const commitRename = async () => {
    if (!editSec) return;
    const { id, val } = editSec;
    const name = val.trim();
    setEditSec(null);
    const sec = s.sections.find((x) => x.id === id);
    if (!name || !sec || sec.name === name) return;
    try {
      await api.patchSection(id, { name });
      s.set((st) => ({ sections: st.sections.map((x) => (x.id === id ? { ...x, name } : x)) }));
    } catch (e: any) { s.pushToast(e?.message || 'Could not rename section', 'bad'); }
  };
  const delSection = async (id: string) => {
    try {
      await api.delSection(id);
      s.set((st) => ({
        sections: st.sections.filter((x) => x.id !== id),
        tasks: st.tasks.map((t) => (t.sectionId === id ? { ...t, sectionId: null } : t)),
      }));
      s.pushToast('Section deleted');
    } catch (e: any) { s.pushToast(e?.message || 'Could not delete section', 'bad'); }
  };

  // ---- build grouped item list ----
  const items: Item[] = [];
  const passRow = (t: Task) => {
    const kidsN = projTasks.filter((x) => x.par === t.id).length;
    return !s.statusFilter || t.ms || kidsN > 0 || !!s.statusFilter[t.st];
  };
  const pushRow = (t: Task) => {
    if (passRow(t)) items.push({ kind: 'row', key: 'r' + t.id, t });
    projTasks.filter((x) => x.par === t.id).forEach(pushRow);
  };
  const roots = projTasks.filter((t) => !t.par && t.s !== null);

  if (grp === 'phase') {
    roots.forEach((t) => {
      const kids = projTasks.filter((x) => x.par === t.id);
      if (kids.length) {
        const lv = s.desc(t.id).filter((x) => !x.ms && !projTasks.some((y) => y.par === x.id));
        const pct = lv.length ? Math.round(lv.reduce((a, x) => a + x.pg, 0) / lv.length) : t.pg;
        items.push({ kind: 'hdr', key: 'h' + t.id, gid: t.id, label: t.name, count: kids.length, pct });
        if (!collapsed[t.id]) kids.forEach(pushRow);
      } else pushRow(t);
    });
  } else if (grp === 'none') {
    roots.forEach(pushRow);
  } else {
    // section grouping: leaf/standalone tasks bucketed by sectionId
    const leafRows = projTasks.filter((t) => t.s !== null && !projTasks.some((x) => x.par === t.id));
    const bucket = (sid: string | null) => leafRows.filter((t) => (t.sectionId ?? null) === sid && passRow(t));
    const pushGroup = (gid: string, label: string, secId: string | null, rows: Task[]) => {
      const pct = rows.length ? Math.round(rows.reduce((a, t) => a + t.pg, 0) / rows.length) : 0;
      items.push({ kind: 'hdr', key: 'sh_' + gid, gid, label, count: rows.length, pct, isSection: true, secId });
      if (!collapsed[gid]) rows.forEach((t) => items.push({ kind: 'row', key: 'r' + t.id, t }));
    };
    sectionsForProj.forEach((sec) => pushGroup('sec_' + sec.id, sec.name, sec.id, bucket(sec.id)));
    const noRows = bucket(null);
    if (noRows.length || sectionsForProj.length === 0) pushGroup('sec_none', '(No section)', null, noRows);
  }

  // ---- aggregates ----
  const lAvg = leafs.length ? Math.round(leafs.reduce((a, t) => a + t.pg, 0) / leafs.length) : 0;
  const lTotN = leafs.length;
  const lPplN = new Set(leafs.map((t) => t.a).filter(Boolean)).size;
  const lDoneN = leafs.filter((t) => t.st === 'done').length;

  // ---- inline cell menu opener (mirrors prototype openCellMenu) ----
  const openCellMenu = (tid: string, field: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const x = Math.min(e.clientX, window.innerWidth - 250);
    const y = Math.min(e.clientY + 8, window.innerHeight - 320);
    const t = s.task(tid);
    const base = field === 'ds' ? (t?.s ?? TODAY) : (t?.e ?? TODAY);
    const dt = new Date(EP + base * dayMs);
    s.set({ cellMenu: { tid, field, x, y }, cmCal: { y: dt.getUTCFullYear(), m: dt.getUTCMonth() } });
  };

  // ---- bulk actions ----
  const me = s.user?.id || 'BS';
  const bulkDone = () => { selIds.forEach((id) => s.updateTask(id, { st: 'done', pg: 100 })); s.set({ listSel: {} }); s.pushToast(selIds.length + ' tasks marked done'); };
  const bulkAsg = () => { selIds.forEach((id) => s.updateTask(id, { a: me })); s.set({ listSel: {} }); s.pushToast('Assigned to you'); };

  // delete needs a confirm step: first click arms for 3s, second click executes
  const [delArm, setDelArm] = useState(false);
  const delTimer = useRef<number | null>(null);
  useEffect(() => () => { if (delTimer.current) window.clearTimeout(delTimer.current); }, []);
  useEffect(() => { if (selIds.length === 0) setDelArm(false); }, [selIds.length]);
  const bulkDel = () => {
    if (!delArm) {
      setDelArm(true);
      if (delTimer.current) window.clearTimeout(delTimer.current);
      delTimer.current = window.setTimeout(() => setDelArm(false), 3000);
      return;
    }
    if (delTimer.current) window.clearTimeout(delTimer.current);
    setDelArm(false);
    selIds.forEach((id) => s.deleteTask(id));
    s.set({ listSel: {} });
  };

  const cfCols = cfs.map(() => '120px').join(' ');
  const gridCols = `36px 1fr 130px 110px 90px 90px 70px 110px${hasSections ? ' 120px' : ''}${cfCols ? ' ' + cfCols : ''}`;
  const minW = 900 + (hasSections ? 120 : 0) + cfs.length * 120;

  // ---- select-all toggle over VISIBLE leaf tasks ----
  const visLeafIds = items
    .filter((it): it is Extract<Item, { kind: 'row' }> => it.kind === 'row')
    .filter((it) => !projTasks.some((x) => x.par === it.t.id))
    .map((it) => it.t.id);
  const allSel = visLeafIds.length > 0 && visLeafIds.every((id) => s.listSel[id]);
  const someSel = selIds.length > 0;
  const toggleAll = () => {
    if (allSel) s.set({ listSel: {} });
    else {
      const sel: Record<string, boolean> = {};
      visLeafIds.forEach((id) => { sel[id] = true; });
      s.set({ listSel: sel });
    }
  };

  const cfDisplay = (v: any) => (v == null || v === '' ? '—' : Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));

  return (
    <div data-screen-label="List view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--card)', position: 'relative' }}>
      {/* toolbar: group-by + section management */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderBottom: '1px solid var(--line)', background: 'var(--bg)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Group by</span>
        <div style={{ display: 'flex', gap: 2, background: 'var(--muB)', borderRadius: 8, padding: 2 }}>
          {GRPS.map(([k, l]) => (
            <Hover as="span" key={k} onClick={() => setGroupBy(k)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', color: grp === k ? '#fff' : 'var(--txt2)', background: grp === k ? 'var(--acc)' : 'transparent' }} hover={grp === k ? {} : { background: 'var(--hover)' }}>{l}</Hover>
          ))}
        </div>
        {grp === 'section' && canWrite && (
          <div style={{ marginLeft: 'auto' }}>
            {addingSec ? (
              <input autoFocus value={newSec} onChange={(e) => setNewSec(e.target.value)} placeholder="Section name"
                onKeyDown={(e) => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') { setAddingSec(false); setNewSec(''); } }}
                onBlur={addSection}
                style={{ fontSize: 12, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--line)', background: 'var(--card)', color: 'var(--txt)', outline: 'none', width: 160 }} />
            ) : (
              <Hover as="span" onClick={() => setAddingSec(true)} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accT)', padding: '4px 9px', borderRadius: 7, cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}>＋ Add section</Hover>
            )}
          </div>
        )}
      </div>

      <div style={{ flex: 1, minHeight: 0, overflow: 'auto', position: 'relative' }}>
        <div style={{ minWidth: minW }}>
          {/* sticky header */}
          <div style={{ position: 'sticky', top: 0, zIndex: 3, background: 'var(--bg)', display: 'grid', gridTemplateColumns: gridCols, height: 36, alignItems: 'center', borderBottom: '1px solid var(--line)', fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>
            <span onClick={toggleAll} title={allSel ? 'Clear selection' : 'Select all visible tasks'} style={{ display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
              <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${someSel ? 'var(--acc)' : 'var(--txt3)'}`, background: someSel ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center' }}>
                {allSel && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>}
                {!allSel && someSel && <span style={{ width: 8, height: 2, background: '#fff', borderRadius: 1 }} />}
              </span>
            </span>
            <span style={{ padding: '0 8px' }}>Task</span><span>Assignee</span><span>Status</span><span>Start</span><span>Due</span><span>%</span><span>Labels</span>
            {hasSections && <span>Section</span>}
            {cfs.map((f) => <span key={f.id} style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>)}
          </div>

          {/* rows + group headers */}
          {items.map((it) => {
            if (it.kind === 'hdr') {
              const isCol = !!collapsed[it.gid];
              const editing = !!(it.isSection && editSec && editSec.id === it.secId);
              return (
                <div key={it.key} style={{ display: 'flex', alignItems: 'center', gap: 8, height: 34, padding: '0 12px', background: 'var(--bg)', borderBottom: '1px solid var(--line2)', position: 'sticky', top: 36, zIndex: 2 }}>
                  <svg onClick={() => toggleGroup(it.gid)} style={{ cursor: 'pointer', transform: isCol ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                  {editing ? (
                    <input autoFocus value={editSec!.val} onChange={(e) => setEditSec({ id: editSec!.id, val: e.target.value })}
                      onKeyDown={(e) => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditSec(null); }} onBlur={commitRename}
                      style={{ fontSize: 12, fontWeight: 800, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--acc)', background: 'var(--card)', color: 'var(--txt)', outline: 'none' }} />
                  ) : (
                    <span onClick={() => toggleGroup(it.gid)} onDoubleClick={() => { if (it.isSection && it.secId && canWrite) setEditSec({ id: it.secId, val: it.label }); }} title={it.isSection && it.secId && canWrite ? 'Double-click to rename' : undefined} style={{ fontSize: 12, fontWeight: 800, cursor: 'pointer' }}>{it.label}</span>
                  )}
                  <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{it.count} tasks · {it.pct}%</span>
                  <div style={{ width: 90, height: 4, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden' }}><div style={{ width: `${it.pct}%`, height: '100%', background: 'var(--acc)' }} /></div>
                  {it.isSection && it.secId && canWrite && !editing && (
                    <Hover as="span" onClick={() => delSection(it.secId!)} title="Delete section" style={{ marginLeft: 'auto', color: 'var(--txt3)', cursor: 'pointer', borderRadius: 6, padding: '0 6px', fontSize: 13, lineHeight: '20px' }} hover={{ background: 'var(--hover)', color: 'var(--bdT)' }}>✕</Hover>
                  )}
                </div>
              );
            }
            const t = it.t;
            const st = stMeta(t.ms ? 'mut' : t.st);
            const late = !t.ms && t.st !== 'done' && (t.e ?? 0) < TODAY;
            const kidsN = projTasks.filter((x) => x.par === t.id).length;
            const on = !!s.listSel[t.id];
            const labels = t.lbl || [];
            return (
              <Hover key={it.key} style={{ display: 'grid', gridTemplateColumns: gridCols, height: rh, alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 12.5, background: on ? 'var(--accS)' : 'transparent' }} hover={{ background: 'var(--hover)' }}>
                <span onClick={(e) => { e.stopPropagation(); s.set((x) => ({ listSel: { ...x.listSel, [t.id]: !x.listSel[t.id] } })); }} style={{ display: 'grid', placeItems: 'center', cursor: 'pointer', height: '100%' }}>
                  <span style={{ width: 14, height: 14, borderRadius: 4, border: `1.5px solid ${on ? 'var(--acc)' : 'var(--txt3)'}`, background: on ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center' }}>
                    {on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>}
                  </span>
                </span>
                <span onClick={() => s.openTask(t.id)} style={{ padding: '0 8px', fontWeight: 500, cursor: 'pointer', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t.ms && <svg width="10" height="10" viewBox="0 0 24 24" fill="var(--msC)"><path d="M12 2l6 10-6 10-6-10z" /></svg>}
                  {t.name}
                  {kidsN > 0 && <span style={{ fontSize: 10, color: 'var(--txt3)', fontWeight: 600 }}>⌥ {kidsN}</span>}
                </span>
                <span onClick={(e) => openCellMenu(t.id, 'av', e)} style={{ cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6 }}>
                  {t.a ? <>
                    <span style={{ width: 20, height: 20, borderRadius: '50%', background: s.members[t.a]?.c || 'var(--txt3)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800 }}>{s.members[t.a] ? t.a : '?'}</span>
                    <span style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{s.members[t.a] ? s.members[t.a].n.split(' ')[0] : 'Unknown'}</span>
                  </> : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--txt3)', display: 'grid', placeItems: 'center', color: 'var(--txt3)', fontSize: 10 }}>+</span>}
                </span>
                <span onClick={(e) => openCellMenu(t.id, 'st', e)} style={{ cursor: 'pointer' }}><span style={{ fontSize: 10, fontWeight: 700, padding: '2.5px 9px', borderRadius: 99, background: st.b, color: st.t }}>{t.ms ? 'Milestone' : st.l}</span></span>
                <span onClick={(e) => openCellMenu(t.id, 'ds', e)} style={{ color: 'var(--txt2)', fontSize: 11.5, cursor: 'pointer' }}>{t.s != null ? fmt(t.s) : '—'}</span>
                <span onClick={(e) => openCellMenu(t.id, 'de', e)} style={{ color: late ? 'var(--bdT)' : 'var(--txt2)', fontWeight: late ? 700 : 400, fontSize: 11.5, cursor: 'pointer' }}>{t.ms ? '—' : (t.e != null ? fmt(t.e) : '—')}</span>
                <span onClick={(e) => openCellMenu(t.id, 'pg', e)} style={{ color: 'var(--txt2)', fontSize: 11.5, cursor: 'pointer', fontVariantNumeric: 'tabular-nums' }}>{t.ms ? '—' : t.pg + '%'}</span>
                <span style={{ display: 'flex', gap: 4, overflow: 'hidden' }}>{labels.map((n, i) => <span key={i} style={{ fontSize: 9.5, fontWeight: 700, background: 'var(--accS)', color: 'var(--accT)', borderRadius: 99, padding: '2px 7px', whiteSpace: 'nowrap' }}>{n}</span>)}</span>
                {hasSections && (
                  <span onClick={(e) => e.stopPropagation()} style={{ display: 'flex', alignItems: 'center' }}>
                    {canWrite ? (
                      <select value={t.sectionId ?? ''} onChange={(e) => s.updateTask(t.id, { sectionId: e.target.value || null })} style={{ fontSize: 11, color: 'var(--txt2)', background: 'transparent', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 4px', maxWidth: 112, cursor: 'pointer' }}>
                        <option value="">(No section)</option>
                        {sectionsForProj.map((sec) => <option key={sec.id} value={sec.id}>{sec.name}</option>)}
                      </select>
                    ) : (
                      <span style={{ fontSize: 11.5, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sectionsForProj.find((x) => x.id === t.sectionId)?.name || '—'}</span>
                    )}
                  </span>
                )}
                {cfs.map((f) => <span key={f.id} style={{ fontSize: 11.5, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{cfDisplay(t.cf?.[f.id])}</span>)}
              </Hover>
            );
          })}

          {/* footer aggregates */}
          <div style={{ display: 'grid', gridTemplateColumns: gridCols, height: 38, alignItems: 'center', borderTop: '1px solid var(--line)', background: 'var(--bg)', fontSize: 11, color: 'var(--txt3)', fontWeight: 600, position: 'sticky', bottom: 0 }}>
            <span /><span style={{ padding: '0 8px' }}>{lTotN} tasks</span><span>{lPplN} people</span><span>{lDoneN} done</span><span /><span /><span>avg {lAvg}%</span><span />
            {hasSections && <span />}
            {cfs.map((f) => <span key={f.id} />)}
          </div>
        </div>
      </div>

      {/* bulk-action bar */}
      {selIds.length > 0 && (
        <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 50, display: 'flex', alignItems: 'center', gap: 6, background: '#18181B', borderRadius: 14, padding: '8px 10px', boxShadow: 'var(--sh3)', animation: 'vup .18s ease' }}>
          <span style={{ fontSize: 11.5, fontWeight: 800, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '4px 10px' }}>{selIds.length} selected</span>
          <Hover as="span" onClick={bulkDone} style={{ fontSize: 11.5, fontWeight: 600, color: '#E4E4E7', padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }} hover={{ background: 'rgba(255,255,255,.12)' }}>✓ Mark done</Hover>
          <Hover as="span" onClick={bulkAsg} style={{ fontSize: 11.5, fontWeight: 600, color: '#E4E4E7', padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }} hover={{ background: 'rgba(255,255,255,.12)' }}>Assign to me</Hover>
          <Hover as="span" onClick={bulkDel} style={{ fontSize: 11.5, fontWeight: delArm ? 800 : 600, color: delArm ? '#fff' : '#FCA5A5', background: delArm ? '#DC2626' : 'transparent', padding: '5px 10px', borderRadius: 8, cursor: 'pointer' }} hover={{ background: delArm ? '#B91C1C' : 'rgba(255,255,255,.12)' }}>{delArm ? `Really delete ${selIds.length}?` : 'Delete'}</Hover>
          <span onClick={() => s.set({ listSel: {} })} style={{ color: '#71717A', cursor: 'pointer', padding: '4px 6px' }}>✕</span>
        </div>
      )}
    </div>
  );
}
