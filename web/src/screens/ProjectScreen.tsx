import { useStore } from '../store';
import { api } from '../api';
import { Hover } from '../components/Hover';
import { CellMenu } from '../components/CellMenu';
import { stMeta } from '../lib/meta';
import { Gantt } from './gantt/Gantt';
import { ListView } from './views/ListView';
import { BoardView } from './views/BoardView';
import { CalendarView } from './views/CalendarView';
import { WorkloadView } from './views/WorkloadView';
import { ProjectDashboard } from './views/ProjectDashboard';

const seg = (on: boolean) => ({ background: on ? 'var(--card)' : 'transparent', color: on ? 'var(--txt)' : 'var(--txt2)', fontWeight: on ? 600 : 500, boxShadow: on ? 'var(--sh1)' : 'none' } as const);

export function ProjectScreen() {
  const s = useStore();
  const proj = s.proj(s.projectId) || s.projects[0];
  if (!proj) return null;
  const stLabelProj = ({ ok: 'On track', prog: 'On track', risk: 'At risk', bad: 'Off track', mut: 'Not started' } as any)[proj.st];
  const projStB = ({ ok: 'var(--okB)', risk: 'var(--waB)', bad: 'var(--bdB)', mut: 'var(--muB)' } as any)[proj.st] || 'var(--muB)';
  const projStT = ({ ok: 'var(--okT)', risk: 'var(--waT)', bad: 'var(--bdT)', mut: 'var(--muT)' } as any)[proj.st] || 'var(--muT)';
  const catL = (s.categories.find((c) => c.id === proj.cat) || {}).label || '';
  const isGantt = s.view === 'gantt';
  const filtN = s.statusFilter ? Object.keys(s.statusFilter).filter((k) => s.statusFilter![k]).length : 0;
  const stKeys = ['mut', 'prog', 'risk', 'bad', 'done'];
  const readOnly = ['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws] || '');
  const canDelete = ['OWNER', 'ADMIN'].includes(s.myRoles[s.ws] || '');
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(s.myRoles[s.ws] || '');
  const COLORS = ['#6366F1', '#0891B2', '#059669', '#D97706', '#DC2626', '#7C3AED', '#DB2777', '#475569'];
  const mi = { display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' } as const;
  const closeMenu = () => s.set({ projMenuOpen: false });
  const delProject = () => {
    closeMenu();
    if (!window.confirm(`Move project "${proj.name}" to Trash? You can restore it within 30 days.`)) return;
    s.deleteProject(proj.id).catch((e: any) => s.pushToast(e?.message || 'Delete failed', 'bad'));
  };
  const renameProj = () => {
    closeMenu();
    const name = window.prompt('Project name', proj.name);
    if (name && name.trim() && name.trim() !== proj.name) s.patchProjectMeta(proj.id, { name: name.trim() }, 'Project renamed').catch((e: any) => s.pushToast(e?.message || 'Rename failed', 'bad'));
  };
  const duplicateProj = async () => {
    closeMenu();
    try { const np = await api.duplicateProject(proj.id); s.pushToast(`"${np.name}" created`); await s.bootstrap(); s.set({ screen: 'project', projectId: np.id }); }
    catch (e: any) { s.pushToast(e?.message || 'Duplicate failed', 'bad'); }
  };
  const saveTemplate = async () => {
    closeMenu();
    try { await api.saveAsTemplate(proj.id); s.pushToast('Saved as template — pick it under "From template" when creating a project'); await s.bootstrap(); }
    catch (e: any) { s.pushToast(e?.message || 'Save failed', 'bad'); }
  };
  const exportCsv = () => { closeMenu(); api.downloadProjectCsv(proj.id, proj.name).then(() => s.pushToast('CSV exported')).catch((e: any) => s.pushToast(e?.message || 'Export failed', 'bad')); };
  const exportXlsx = () => { closeMenu(); api.downloadProjectXlsx(proj.id, proj.name).then(() => s.pushToast('Excel Gantt exported')).catch((e: any) => s.pushToast(e?.message || 'Export failed', 'bad')); };
  const archiveProj = () => {
    closeMenu();
    if (!window.confirm(`Archive "${proj.name}"? It moves out of the sidebar; unarchive any time from the Trash screen.`)) return;
    s.patchProjectMeta(proj.id, { archived: true }, 'Project archived — find it on the Trash screen').catch((e: any) => s.pushToast(e?.message || 'Archive failed', 'bad'));
  };
  const setShare = (on: boolean) => {
    api.shareProject(proj.id, on)
      .then((r: any) => { s.set((x) => ({ projects: x.projects.map((p) => (p.id === proj.id ? { ...p, shareToken: r.token } : p)) })); s.pushToast(on ? 'Share link created' : 'Share link disabled'); })
      .catch((e: any) => s.pushToast(e?.message || 'Share failed', 'bad'));
  };

  // Real project avatars: owner + members who have tasks assigned in this project.
  const assignees = Array.from(new Set(s.tasks.filter((t) => t.pid === proj.id && t.a).map((t) => t.a as string)));
  const memberIds = Array.from(new Set([proj.owner, ...assignees])).filter((id) => s.members[id]);
  const avIds = memberIds.length ? memberIds : [proj.owner];
  const avShown = avIds.slice(0, 4);
  const avExtra = avIds.length - avShown.length;

  const tab = (label: string, v: string, click: () => void) => (
    <span onClick={click} style={{ fontSize: 12, padding: '5px 13px', borderRadius: 7, cursor: 'pointer', transition: 'all .15s', ...seg(s.view === v) }}>{label}</span>
  );
  const zSeg = (label: string, z: string) => (
    <span onClick={() => s.setZoom(z as any)} style={{ padding: '3.5px 9px', borderRadius: 6, cursor: 'pointer', ...seg(s.zoom === z) }}>{label}</span>
  );

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, minWidth: 0 }}>
      {/* project header */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px 0' }}>
        <span style={{ width: 24, height: 24, borderRadius: 7, background: proj.color, display: 'grid', placeItems: 'center', color: '#fff', fontSize: 9, fontWeight: 800, flex: 'none' }}>{proj.code}</span>
        <span style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-.01em', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{proj.name}</span>
        <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 9px', borderRadius: 99, background: projStB, color: projStT, flex: 'none' }}>{stLabelProj}</span>
        <span style={{ fontSize: 11, color: 'var(--txt3)', flex: 'none' }}>{catL}</span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }} onMouseDown={(e) => e.stopPropagation()}>
          <div style={{ display: 'flex' }}>
            {avShown.map((id, i) => <span key={id} title={s.members[id]?.n || id} style={{ width: 24, height: 24, borderRadius: '50%', background: s.members[id]?.c || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800, border: '2px solid var(--bg)', marginLeft: i === 0 ? 0 : -7 }}>{id}</span>)}
            {avExtra > 0 && <span style={{ width: 24, height: 24, borderRadius: '50%', background: 'var(--muB)', color: 'var(--muT)', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800, border: '2px solid var(--bg)', marginLeft: -7 }}>+{avExtra}</span>}
          </div>
          <div style={{ position: 'relative' }}>
            <span onClick={() => s.set((x) => ({ shareOpen: !x.shareOpen }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 600, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '6px 12px', cursor: 'pointer' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="5" r="3" /><circle cx="6" cy="12" r="3" /><circle cx="18" cy="19" r="3" /><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4" /></svg>Share</span>
            {s.shareOpen && (
              <div style={{ position: 'absolute', top: 34, right: 0, width: 290, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 13, boxShadow: 'var(--sh3)', padding: 13, zIndex: 70, animation: 'vpop .16s ease' }}>
                <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Share project</div>
                {proj.shareToken ? (<>
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <span style={{ flex: 1, fontSize: 11, color: 'var(--txt2)', background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 7, padding: '6px 9px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{location.origin + '/share/' + proj.shareToken}</span>
                    <span onClick={() => { navigator.clipboard?.writeText(location.origin + '/share/' + proj.shareToken).catch(() => {}); s.pushToast('Link copied to clipboard'); }} style={{ fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--acc)', borderRadius: 7, padding: '6px 11px', cursor: 'pointer', flex: 'none' }}>Copy</span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 11.5, color: 'var(--txt2)' }}>
                    <span>Anyone with link · <b style={{ color: 'var(--txt)' }}>can view</b></span>
                    {canManage && <span onClick={() => setShare(false)} style={{ color: 'var(--bdT)', fontWeight: 600, cursor: 'pointer' }}>Disable</span>}
                  </div>
                </>) : (<>
                  <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 10 }}>Create a public, read-only link so people outside this workspace can view the plan.</div>
                  {canManage
                    ? <span onClick={() => setShare(true)} style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: '#fff', background: 'var(--acc)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer' }}>Create link</span>
                    : <span style={{ fontSize: 11, color: 'var(--txt3)' }}>Ask a manager to create a share link.</span>}
                </>)}
              </div>
            )}
          </div>
          {(canManage || canDelete) && (
            <div style={{ position: 'relative' }}>
              <Hover onClick={() => s.set((x) => ({ projMenuOpen: !x.projMenuOpen, shareOpen: false }))} title="Project actions" style={{ width: 27, height: 27, borderRadius: 8, border: '1px solid var(--line)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--txt2)', flex: 'none' }} hover={{ background: 'var(--hover)' }}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8" /><circle cx="12" cy="12" r="1.8" /><circle cx="19" cy="12" r="1.8" /></svg>
              </Hover>
              {s.projMenuOpen && (
                <div style={{ position: 'absolute', top: 32, right: 0, width: 214, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh3)', padding: 5, zIndex: 70, animation: 'vpop .15s ease' }}>
                  {canManage && <>
                    <Hover onClick={renameProj} style={mi} hover={{ background: 'var(--hover)' }}>Rename project</Hover>
                    <div style={{ display: 'flex', gap: 5, padding: '6px 9px' }}>
                      {COLORS.map((c) => <span key={c} onClick={() => s.patchProjectMeta(proj.id, { color: c })} style={{ width: 16, height: 16, borderRadius: 5, background: c, cursor: 'pointer', border: proj.color === c ? '2px solid var(--txt)' : '2px solid transparent' }} />)}
                    </div>
                    <Hover onClick={duplicateProj} style={mi} hover={{ background: 'var(--hover)' }}>Duplicate project</Hover>
                    <Hover onClick={saveTemplate} style={mi} hover={{ background: 'var(--hover)' }}>Save as template</Hover>
                    <Hover onClick={exportCsv} style={mi} hover={{ background: 'var(--hover)' }}>Export CSV</Hover>
                    <Hover onClick={exportXlsx} style={mi} hover={{ background: 'var(--hover)' }}>Export Excel (Gantt)</Hover>
                    <Hover onClick={archiveProj} style={mi} hover={{ background: 'var(--hover)' }}>Archive project</Hover>
                  </>}
                  {canDelete && <>
                    <div style={{ height: 1, background: 'var(--line2)', margin: '4px 2px' }} />
                    <Hover onClick={delProject} style={{ ...mi, fontWeight: 600, color: 'var(--bdT)' }} hover={{ background: 'var(--bdB)' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" /></svg>
                      Delete project
                    </Hover>
                  </>}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* toolbar */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, rowGap: 7, padding: '9px 16px', borderBottom: '1px solid var(--line)', flexWrap: 'wrap' }} onMouseDown={(e) => e.stopPropagation()}>
        <div style={{ display: 'flex', background: 'var(--muB)', borderRadius: 9, padding: 2, flex: 'none' }}>
          {tab('Gantt', 'gantt', () => s.setView('gantt'))}
          {tab('List', 'list', () => s.setView('list'))}
          {tab('Board', 'board', () => s.setView('board'))}
          {tab('Calendar', 'calendar', () => s.setView('calendar'))}
          {tab('Workload', 'workload', () => s.setView('workload'))}
          {tab('Dashboard', 'pdash', () => s.setView('pdash'))}
        </div>
        <span style={{ width: 1, height: 18, background: 'var(--line)', flex: 'none' }} />
        <div style={{ position: 'relative', flex: 'none' }}>
          <Hover onClick={() => s.set((x) => ({ filterOpen: !x.filterOpen }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, color: filtN ? 'var(--accT)' : 'var(--txt2)', border: `1px dashed ${filtN ? 'var(--acc)' : 'var(--txt3)'}`, borderRadius: 99, padding: '4.5px 11px', cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M22 3H2l8 9.46V19l4 2v-8.54z" /></svg>{filtN ? 'Filter · ' + filtN : 'Filter'}</Hover>
          {s.filterOpen && (
            <div style={{ position: 'absolute', top: 32, left: 0, width: 190, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh3)', padding: 6, zIndex: 70, animation: 'vpop .15s ease' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', padding: '5px 8px' }}>Status</div>
              {stKeys.map((k) => { const m = stMeta(k); const on = !s.statusFilter || !!s.statusFilter[k]; return (
                <Hover key={k} onClick={() => s.set((x) => { const f: Record<string, number> = x.statusFilter ? { ...x.statusFilter } : { mut: 1, prog: 1, risk: 1, bad: 1, done: 1 }; f[k] = f[k] ? 0 : 1; const all = stKeys.every((z) => f[z]); return { statusFilter: all ? null : f }; })} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 7, cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}>
                  <span style={{ width: 13, height: 13, borderRadius: 4, border: `1.5px solid ${on ? 'var(--acc)' : 'var(--txt3)'}`, background: on ? 'var(--acc)' : 'transparent', display: 'grid', placeItems: 'center', flex: 'none' }}>{on && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="4"><path d="M5 13l4 4L19 7" /></svg>}</span>
                  <span style={{ fontSize: 11.5, fontWeight: 600, padding: '2px 8px', borderRadius: 99, background: m.b, color: m.t }}>{m.l}</span>
                </Hover>
              ); })}
            </div>
          )}
        </div>
        <span style={{ flex: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--txt2)', border: '1px solid var(--line)', borderRadius: 99, padding: '4.5px 11px', cursor: 'pointer' }}>Group: Phase</span>
        <div style={{ position: 'relative', flex: 'none' }}>
          <Hover onClick={() => s.set((x) => ({ viewsOpen: !x.viewsOpen }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11.5, fontWeight: 500, color: 'var(--txt2)', border: '1px solid var(--line)', borderRadius: 99, padding: '4.5px 11px', cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}><svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 3l2.1 6.3H21l-5.4 3.9 2 6.3-5.6-3.9-5.6 3.9 2-6.3L3 9.3h6.9z" /></svg>Saved views<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg></Hover>
          {s.viewsOpen && (
            <div style={{ position: 'absolute', top: 32, left: 0, width: 210, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 12, boxShadow: 'var(--sh3)', padding: 5, zIndex: 70, animation: 'vpop .15s ease' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', background: 'var(--accS)', color: 'var(--accT)', fontSize: 12, fontWeight: 600 }}>Default Gantt<span style={{ marginLeft: 'auto' }}>✓</span></div>
              <Hover style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>Exec review (Month)</Hover>
              <Hover style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--txt2)' }} hover={{ background: 'var(--hover)' }}>My critical items</Hover>
              <div style={{ height: 1, background: 'var(--line2)', margin: '4px 2px' }} />
              <Hover onClick={() => { s.set({ viewsOpen: false }); s.pushToast('View saved as "My view 1"'); }} style={{ padding: '7px 9px', borderRadius: 8, cursor: 'pointer', fontSize: 12, color: 'var(--accT)', fontWeight: 600 }} hover={{ background: 'var(--hover)' }}>＋ Save current view</Hover>
            </div>
          )}
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 8, flex: 'none' }}>
          {isGantt && <>
            <span onClick={() => s.set((x) => ({ baselineOn: !x.baselineOn }))} style={{ fontSize: 11, fontWeight: 600, color: s.baselineOn ? 'var(--accT)' : 'var(--txt2)', border: `1px solid ${s.baselineOn ? 'var(--acc)' : 'var(--line)'}`, background: s.baselineOn ? 'var(--accS)' : 'transparent', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', flex: 'none' }}>Baseline</span>
            <span onClick={() => s.set((x) => ({ criticalOn: !x.criticalOn }))} style={{ fontSize: 11, fontWeight: 600, color: s.criticalOn ? 'var(--bdT)' : 'var(--txt2)', border: `1px solid ${s.criticalOn ? 'var(--bd)' : 'var(--line)'}`, background: s.criticalOn ? 'var(--bdB)' : 'transparent', borderRadius: 8, padding: '5px 10px', cursor: 'pointer', flex: 'none' }}>Critical path</span>
            <div style={{ display: 'flex', background: 'var(--muB)', borderRadius: 8, padding: 2, fontSize: 11, fontWeight: 500, flex: 'none' }}>
              {zSeg('Day', 'day')}{zSeg('Week', 'week')}{zSeg('Month', 'month')}{zSeg('Qtr', 'quarter')}
            </div>
            <span onClick={() => s.set({ present: true, soId: null, aiPanel: false, quickAdd: false, palette: false, cellMenu: null, pp: null })} title="Full-screen for presentation" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: '#fff', background: '#18181B', borderRadius: 8, padding: '5px 12px', cursor: 'pointer', flex: 'none' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M8 21H5a2 2 0 0 1-2-2v-3M16 21h3a2 2 0 0 0 2-2v-3" /></svg>Present</span>
          </>}
          {!readOnly && (
            <span onClick={() => s.autoSchedule()} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: 'var(--accT)', border: '1px solid var(--acc2)', background: s.asBusy ? 'var(--accS)' : 'transparent', borderRadius: 8, padding: '5px 11px', cursor: 'pointer', flex: 'none' }}>
              {s.asBusy ? <svg style={{ animation: 'vspin .7s linear infinite' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
                : <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>}
              {s.asBusy ? 'Scheduling…' : s.autoDone ? 'Auto-schedule ✓' : 'Auto-schedule'}
            </span>
          )}
          <Hover onClick={() => s.set((x) => ({ density: x.density === 'comf' ? 'comp' : 'comf' }))} title="Density" style={{ width: 27, height: 27, borderRadius: 8, border: '1px solid var(--line)', display: 'grid', placeItems: 'center', cursor: 'pointer', color: 'var(--txt2)', flex: 'none' }} hover={{ background: 'var(--hover)' }}>
            {s.density === 'comf' ? <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 6h18M3 12h18M3 18h18" /></svg>
              : <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M3 5h18M3 9h18M3 13h18M3 17h18M3 21h18" /></svg>}
          </Hover>
        </div>
      </div>

      {/* view */}
      {s.view === 'gantt' && <Gantt />}
      {s.view === 'list' && <ListView />}
      {s.view === 'board' && <BoardView />}
      {s.view === 'calendar' && <CalendarView />}
      {s.view === 'workload' && <WorkloadView />}
      {s.view === 'pdash' && <ProjectDashboard />}

      <CellMenu />
    </div>
  );
}
