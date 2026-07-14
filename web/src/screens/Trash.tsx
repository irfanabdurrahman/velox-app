import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Hover } from '../components/Hover';
import type { Task } from '../types';

type TrashItem = Task & { projectName: string; deletedAt: string };

const fmtDel = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
};

export function Trash() {
  const s = useStore();
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(s.myRoles[s.ws]);
  const [rows, setRows] = useState<TrashItem[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!canManage) return;
    let alive = true;
    setRows(null);
    api.trash()
      .then((r: TrashItem[]) => { if (alive) setRows(r); })
      .catch((e: any) => { if (alive) { setRows([]); s.pushToast('Could not load trash — ' + (e?.message || 'failed'), 'bad'); } });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canManage, s.ws]);

  const mark = (id: string, on: boolean) => setBusy((b) => { const n = { ...b }; if (on) n[id] = true; else delete n[id]; return n; });

  const restore = async (item: TrashItem) => {
    mark(item.id, true);
    try {
      await api.restoreTask(item.id);
      setRows((rs) => (rs || []).filter((r) => r.id !== item.id));
      // add the row back into the live task list when its project is loaded (open workspace)
      const { projectName, deletedAt, ...task } = item;
      void projectName; void deletedAt;
      s.set((st) => {
        const loaded = st.projects.some((p) => p.id === task.pid);
        if (!loaded || st.tasks.some((t) => t.id === task.id)) return {};
        return { tasks: [...st.tasks, task as Task] };
      });
      s.pushToast('Task restored');
    } catch (e: any) {
      s.pushToast('Restore failed — ' + (e?.message || 'server rejected'), 'bad');
    } finally { mark(item.id, false); }
  };

  const purge = async (item: TrashItem) => {
    if (!window.confirm(`Permanently delete "${item.name}"? This cannot be undone.`)) return;
    mark(item.id, true);
    try {
      await api.purgeTask(item.id);
      setRows((rs) => (rs || []).filter((r) => r.id !== item.id));
      s.pushToast('Task permanently deleted');
    } catch (e: any) {
      s.pushToast('Delete failed — ' + (e?.message || 'server rejected'), 'bad');
    } finally { mark(item.id, false); }
  };

  const cols = '1fr 150px 104px 168px';

  return (
    <div data-screen-label="Trash" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ maxWidth: 860, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Trash</span>
          <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>· items are kept 30 days</span>
        </div>

        {canManage && <ProjectTrashSection />}

        {!canManage ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 14, padding: '44px 20px', textAlign: 'center', boxShadow: 'var(--sh1)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>You need manager rights</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Only workspace owners, admins, and managers can view or restore deleted tasks.</div>
          </div>
        ) : rows === null ? (
          <div style={{ fontSize: 12, color: 'var(--txt3)', padding: '30px 0', textAlign: 'center' }}>Loading trash…</div>
        ) : rows.length === 0 ? (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 14, padding: '44px 20px', textAlign: 'center', boxShadow: 'var(--sh1)' }}>
            <div style={{ width: 44, height: 44, borderRadius: 13, background: 'var(--muB)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>Trash is empty</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Deleted tasks show up here for 30 days before they are removed for good.</div>
          </div>
        ) : (
          <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '9px 15px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)' }}>
              <span>Task</span><span>Project</span><span>Deleted</span><span style={{ textAlign: 'right' }}>Actions</span>
            </div>
            {rows.map((item) => {
              const proj = s.proj(item.pid);
              const isBusy = !!busy[item.id];
              return (
                <div key={item.id} style={{ display: 'grid', gridTemplateColumns: cols, gap: 10, padding: '10px 15px', alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 12.5, opacity: isBusy ? 0.55 : 1 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    {item.ms
                      ? <span style={{ width: 8, height: 8, background: 'var(--msC)', transform: 'rotate(45deg)', borderRadius: 2, flex: 'none' }} />
                      : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--txt3)', flex: 'none' }} />}
                    <span style={{ fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.name}</span>
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0, fontSize: 11.5, color: 'var(--txt2)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: proj?.color || 'var(--txt3)', flex: 'none' }} />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.projectName}</span>
                  </span>
                  <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{fmtDel(item.deletedAt)}</span>
                  <span style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <Hover as="span" onClick={() => !isBusy && restore(item)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 7, padding: '4px 10px', cursor: isBusy ? 'default' : 'pointer' }} hover={{ background: 'var(--acc)', color: '#fff' }}>Restore</Hover>
                    <Hover as="span" onClick={() => !isBusy && purge(item)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--bdT)', background: 'var(--bdB)', borderRadius: 7, padding: '4px 10px', cursor: isBusy ? 'default' : 'pointer' }} hover={{ background: 'var(--bd)', color: '#fff' }}>Delete forever</Hover>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ---- projects in trash + archived projects ---------------------------------
function ProjectTrashSection() {
  const s = useStore();
  const isAdmin = ['OWNER', 'ADMIN'].includes(s.myRoles[s.ws] || '');
  const [trashed, setTrashed] = useState<any[] | null>(null);
  const [archived, setArchived] = useState<any[] | null>(null);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  useEffect(() => {
    let alive = true;
    setTrashed(null); setArchived(null);
    api.trashProjects(s.ws).then((r: any[]) => { if (alive) setTrashed(r); }).catch(() => { if (alive) setTrashed([]); });
    api.archivedProjects(s.ws).then((r: any[]) => { if (alive) setArchived(r); }).catch(() => { if (alive) setArchived([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ws]);
  const mark = (id: string, on: boolean) => setBusy((b) => { const n = { ...b }; if (on) n[id] = true; else delete n[id]; return n; });
  const btn = (label: string, danger: boolean, oC: () => void, off: boolean) => (
    <Hover as="span" onClick={() => !off && oC()} style={{ fontSize: 11, fontWeight: 700, color: danger ? 'var(--bdT)' : 'var(--accT)', background: danger ? 'var(--bdB)' : 'var(--accS)', borderRadius: 7, padding: '4px 10px', cursor: off ? 'default' : 'pointer' }} hover={{ background: danger ? 'var(--bd)' : 'var(--acc)', color: '#fff' }}>{label}</Hover>
  );
  const restoreP = async (p: any) => { mark(p.id, true); try { await api.restoreProject(p.id); setTrashed((r) => (r || []).filter((x) => x.id !== p.id)); s.pushToast(`"${p.name}" restored`); await s.bootstrap(); } catch (e: any) { s.pushToast('Restore failed — ' + (e?.message || 'server rejected'), 'bad'); } finally { mark(p.id, false); } };
  const purgeP = async (p: any) => { if (!window.confirm(`Permanently delete project "${p.name}" and everything in it? This cannot be undone.`)) return; mark(p.id, true); try { await api.purgeProject(p.id); setTrashed((r) => (r || []).filter((x) => x.id !== p.id)); s.pushToast('Project permanently deleted'); } catch (e: any) { s.pushToast('Delete failed — ' + (e?.message || 'server rejected'), 'bad'); } finally { mark(p.id, false); } };
  const unarchiveP = async (p: any) => { mark(p.id, true); try { await api.patchProject(p.id, { archived: false }); setArchived((r) => (r || []).filter((x) => x.id !== p.id)); s.pushToast(`"${p.name}" unarchived`); await s.bootstrap(); } catch (e: any) { s.pushToast('Unarchive failed — ' + (e?.message || 'server rejected'), 'bad'); } finally { mark(p.id, false); } };
  const card = (title: string, rows: any[] | null, empty: string, actions: (p: any) => JSX.Element) => (
    <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', overflow: 'hidden', marginBottom: 14 }}>
      <div style={{ padding: '9px 15px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)' }}>{title}</div>
      {rows === null
        ? <div style={{ padding: 14, fontSize: 11.5, color: 'var(--txt3)' }}>Loading…</div>
        : rows.length === 0
          ? <div style={{ padding: 14, fontSize: 11.5, color: 'var(--txt3)' }}>{empty}</div>
          : rows.map((p) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 15px', borderBottom: '1px solid var(--line2)', fontSize: 12.5, opacity: busy[p.id] ? 0.55 : 1 }}>
              <span style={{ width: 20, height: 20, borderRadius: 6, background: p.color, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8, fontWeight: 800, flex: 'none' }}>{p.code}</span>
              <span style={{ flex: 1, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
              <span style={{ display: 'flex', gap: 6 }}>{actions(p)}</span>
            </div>
          ))}
    </div>
  );
  return (<>
    {card('Projects in trash', trashed, 'No deleted projects.', (p) => (<>
      {isAdmin && btn('Restore', false, () => restoreP(p), !!busy[p.id])}
      {isAdmin && btn('Delete forever', true, () => purgeP(p), !!busy[p.id])}
      {!isAdmin && <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>admin only</span>}
    </>))}
    {card('Archived projects', archived, 'No archived projects.', (p) => btn('Unarchive', false, () => unarchiveP(p), !!busy[p.id]))}
  </>);
}
