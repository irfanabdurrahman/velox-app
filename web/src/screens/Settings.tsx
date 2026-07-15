import { useState } from 'react';
import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { ACCENTS, ACCENT_LABEL, ACCENT_SWATCH } from '../lib/meta';
import { setLang, getLang, useLang } from '../lib/i18n';
import { IntegrationsPanel } from '../components/settings/IntegrationsPanel';
import { AutomationsPanel } from '../components/settings/AutomationsPanel';
import { SecurityPanel } from '../components/settings/SecurityPanel';
import { NotificationsPanel } from '../components/settings/NotificationsPanel';

const setTabDefs: [string, string][] = [
  ['cats', 'Categories'],
  ['integrations', 'Integrations'],
  ['auto', 'Automations'],
  ['tpl', 'Templates'],
  ['app', 'Appearance'],
  ['security', 'Security'],
  ['notif', 'Notifications'],
];

const CAT_COLORS = ['#0EA5E9', '#10B981', '#6366F1', '#F59E0B', '#64748B', '#DB2777', '#84CC16', '#8B5CF6'];

export function Settings() {
  const s = useStore();
  const lang = useLang();
  const canWrite = !['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws]);
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(s.myRoles[s.ws] || '');

  const [newCatOpen, setNewCatOpen] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [editingCat, setEditingCat] = useState<string | null>(null);
  const [editCatName, setEditCatName] = useState('');
  const [expandedCat, setExpandedCat] = useState<string | null>(null);

  const submitNewCat = async () => {
    const label = newCatName.trim();
    if (!label) { setNewCatOpen(false); return; }
    try {
      await s.createCategory(s.ws, label);
      setNewCatName(''); setNewCatOpen(false);
    } catch (e: any) { s.pushToast(e?.message || 'Failed to create category', 'bad'); }
  };

  const submitRename = async (id: string) => {
    const label = editCatName.trim();
    setEditingCat(null);
    if (!label) return;
    try { await s.renameCategory(id, label); }
    catch (e: any) { s.pushToast(e?.message || 'Failed to rename category', 'bad'); }
  };

  const doDeleteCat = async (id: string, label: string, count: number) => {
    if (count > 0 && !confirm(`Delete "${label}"? ${count} project${count === 1 ? '' : 's'} will become uncategorized (not deleted).`)) return;
    try { await s.deleteCategory(id); }
    catch (e: any) { s.pushToast(e?.message || 'Failed to delete category', 'bad'); }
  };

  const tab = s.setTab;

  const tplCards = [
    { ic: '🏗️', n: 'Factory Relocation Project', d: 'Relokasi pabrik end-to-end: site prep sampai ramp-up produksi', rows: ['Site preparation & permits (IMB)', 'Machine disassembly & transport', 'Reassembly & commissioning', 'IT / facility fit-out & ramp-up'] },
    { ic: '⚡', n: 'Software Sprint', d: '2-week sprint: planning → build → review → retro', rows: ['Sprint planning & goal', 'Build (10 slots)', 'QA + review gate', 'Retro & carry-over'] },
    { ic: '🏭', n: 'Manufacturing Kaizen / QCC', d: 'A3 problem-solving with QCC cadence', rows: ['Theme & baseline (A3)', 'Root cause (5-why / fishbone)', 'Countermeasure trials', 'Standardize + yokoten'] },
    { ic: '🎪', n: 'Event', d: 'Run-of-show, vendors, logistics, comms', rows: ['Venue & budget', 'Vendor contracts', 'Run-of-show', 'Post-event report'] },
    { ic: '🎯', n: 'OKR Cycle', d: 'Quarterly objectives with weekly check-ins', rows: ['Draft objectives', 'Align key results', 'Weekly check-ins ×12', 'Scoring & reset'] },
    { ic: '📋', n: 'Audit Preparation', d: 'Evidence tracker with findings workflow', rows: ['Scope & evidence list', 'Gap assessment', 'Remediation tasks', 'Mock audit + readout'] },
  ];
  const themes: [string, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];
  const dens: [string, string][] = [['comf', 'Comfortable'], ['comp', 'Compact (Excel-like)']];
  const langs: [string, string][] = [['en', 'English (EN)'], ['id', 'Bahasa Indonesia (ID)']];
  const wsCats = s.categories.filter((c) => c.ws === s.ws).sort((a, b) => (a.ord ?? 0) - (b.ord ?? 0));
  const wsProjects = s.projects.filter((p) => p.ws === s.ws);
  const uncatProjects = wsProjects.filter((p) => !p.cat);
  const catRows = wsCats.map((c) => ({ id: c.id, n: c.label, color: c.color || CAT_COLORS[0], projects: wsProjects.filter((p) => p.cat === c.id) }));

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--bg)' }}>
      <div style={{ width: 196, flex: 'none', borderRight: '1px solid var(--line)', background: 'var(--panel)', padding: '14px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 8px 8px' }}>Settings</div>
        {setTabDefs.map(([id, n]) => (
          <Hover key={id} onClick={() => s.set({ setTab: id })} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, background: tab === id ? 'var(--accS)' : 'transparent', color: tab === id ? 'var(--accT)' : 'var(--txt2)', fontWeight: tab === id ? 700 : 500, marginBottom: 1 }} hover={{ background: 'var(--hover)' }}>{n}</Hover>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 22px' }}>

        {tab === 'integrations' && <IntegrationsPanel ws={s.ws} canWrite={canWrite} />}

        {tab === 'auto' && <AutomationsPanel ws={s.ws} canWrite={canWrite} />}

        {tab === 'security' && <SecurityPanel ws={s.ws} />}

        {tab === 'notif' && <NotificationsPanel />}

        {tab === 'tpl' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Templates</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Start projects from proven playbooks.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 11 }}>
              {tplCards.map((t) => (
                <Hover key={t.n} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 15, boxShadow: 'var(--sh1)', display: 'flex', flexDirection: 'column' }} hover={{ borderColor: 'var(--acc)' }}>
                  <div style={{ fontSize: 19, marginBottom: 7 }}>{t.ic}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{t.n}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt3)', lineHeight: 1.5, marginBottom: 9, flex: 1 }}>{t.d}</div>
                  {t.rows.map((r0) => <div key={r0} style={{ fontSize: 10, color: 'var(--txt2)', padding: '1.5px 0 1.5px 12px', position: 'relative' }}><span style={{ position: 'absolute', left: 1, top: 6, width: 4, height: 4, borderRadius: '50%', background: 'var(--acc)' }} />{r0}</div>)}
                  <span onClick={() => s.set({ onb: { step: 3, newProj: true, mode: 'tpl', tpl: t.n } })} style={{ marginTop: 10, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 8, padding: 6, cursor: 'pointer' }}>Use template</span>
                </Hover>
              ))}
            </div>
          </>
        )}

        {tab === 'app' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 15 }}>Appearance &amp; language</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, boxShadow: 'var(--sh1)', maxWidth: 520 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Theme</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {themes.map(([id, n]) => { const on = s.theme === id; return <span key={id} onClick={() => s.set({ theme: id as any })} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)' }}>{n}</span>; })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Density</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {dens.map(([id, n]) => { const on = s.density === id; return <span key={id} onClick={() => s.set({ density: id as any })} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)' }}>{n}</span>; })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Accent theme</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {ACCENTS.map((id) => {
                  const c = ACCENT_SWATCH[id]; const n = ACCENT_LABEL[id]; const on = (s.accent || 'indigo') === id;
                  return (
                    <span key={id} onClick={() => { s.set({ accent: id }); s.pushToast('Accent theme: ' + n); }} title={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <Hover as="span" style={{ width: 34, height: 34, borderRadius: '50%', background: c, boxShadow: on ? '0 0 0 2.5px var(--card),0 0 0 5px ' + c : 'var(--sh1)', display: 'grid', placeItems: 'center', transition: 'transform .15s' }} hover={{ transform: 'scale(1.08)' }}>{on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>}</Hover>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: on ? 'var(--accT)' : 'var(--txt3)' }}>{n}</span>
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Language</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {langs.map(([id, n]) => { const on = (lang || getLang()) === id; return <span key={id} onClick={() => { setLang(id as any); s.pushToast(id === 'id' ? 'Bahasa diubah ke Indonesia' : 'Language set to English'); }} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)' }}>{n}</span>; })}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 8 }}>Switching language updates all translated UI strings instantly.</div>
            </div>
          </>
        )}

        {tab === 'cats' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Project categories</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Portfolios that group this workspace's projects in the sidebar &amp; dashboard.</div>
            <div style={{ maxWidth: 560 }}>
              {catRows.map((c) => {
                const open = expandedCat === c.id;
                const editing = editingCat === c.id;
                return (
                  <div key={c.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, marginBottom: 7, boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 3.5, background: c.color, flex: 'none' }} />
                      {editing ? (
                        <input autoFocus value={editCatName} onChange={(e) => setEditCatName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === 'Enter') submitRename(c.id); if (e.key === 'Escape') setEditingCat(null); }}
                          onBlur={() => submitRename(c.id)}
                          style={{ flex: 1, fontSize: 12.5, fontWeight: 700, padding: '3px 7px', borderRadius: 7, border: '1px solid var(--acc)', background: 'var(--bg)', color: 'var(--txt)', outline: 'none' }} />
                      ) : (
                        <span onClick={() => setExpandedCat(open ? null : c.id)} style={{ flex: 1, fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{c.n}</span>
                      )}
                      <span onClick={() => setExpandedCat(open ? null : c.id)} style={{ fontSize: 10.5, color: 'var(--txt3)', cursor: 'pointer' }}>{c.projects.length} project{c.projects.length === 1 ? '' : 's'} {open ? '▲' : '▼'}</span>
                      {canManage && !editing && (
                        <>
                          <Hover as="span" onClick={() => { setEditingCat(c.id); setEditCatName(c.n); }} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer' }} hover={{ color: 'var(--accT)' }}>Rename</Hover>
                          <Hover as="span" onClick={() => doDeleteCat(c.id, c.n, c.projects.length)} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer' }} hover={{ color: 'var(--bdT)' }}>Delete</Hover>
                        </>
                      )}
                    </div>
                    {open && (
                      <div style={{ borderTop: '1px solid var(--line2)', background: 'var(--bg)' }}>
                        {c.projects.length === 0 && <div style={{ padding: '10px 14px', fontSize: 11.5, color: 'var(--txt3)' }}>No projects in this category yet.</div>}
                        {c.projects.map((p) => (
                          <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--line2)', fontSize: 12 }}>
                            <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            {canManage ? (
                              <select value={p.cat ?? ''} onChange={(e) => s.patchProjectMeta(p.id, { cat: e.target.value || null }, 'Project moved')}
                                style={{ fontSize: 11, color: 'var(--txt2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>
                                <option value="">(Uncategorized)</option>
                                {wsCats.map((wc) => <option key={wc.id} value={wc.id}>{wc.label}</option>)}
                              </select>
                            ) : <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{c.n}</span>}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}

              {uncatProjects.length > 0 && (
                <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 12, marginBottom: 7, overflow: 'hidden' }}>
                  <div onClick={() => setExpandedCat(expandedCat === '__uncat' ? null : '__uncat')} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 14px', cursor: 'pointer' }}>
                    <span style={{ width: 10, height: 10, borderRadius: 3.5, background: 'var(--txt3)', flex: 'none' }} />
                    <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700, color: 'var(--txt2)' }}>Uncategorized</span>
                    <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{uncatProjects.length} project{uncatProjects.length === 1 ? '' : 's'} {expandedCat === '__uncat' ? '▲' : '▼'}</span>
                  </div>
                  {expandedCat === '__uncat' && (
                    <div style={{ borderTop: '1px solid var(--line2)', background: 'var(--bg)' }}>
                      {uncatProjects.map((p) => (
                        <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderBottom: '1px solid var(--line2)', fontSize: 12 }}>
                          <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                          {canManage && (
                            <select value="" onChange={(e) => e.target.value && s.patchProjectMeta(p.id, { cat: e.target.value }, 'Project moved')}
                              style={{ fontSize: 11, color: 'var(--txt2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 6, padding: '2px 6px', cursor: 'pointer' }}>
                              <option value="">Move to…</option>
                              {wsCats.map((wc) => <option key={wc.id} value={wc.id}>{wc.label}</option>)}
                            </select>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {canManage && (newCatOpen ? (
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  <input autoFocus value={newCatName} onChange={(e) => setNewCatName(e.target.value)} placeholder="Category name"
                    onKeyDown={(e) => { if (e.key === 'Enter') submitNewCat(); if (e.key === 'Escape') { setNewCatOpen(false); setNewCatName(''); } }}
                    style={{ flex: 1, fontSize: 12.5, padding: '7px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--card)', color: 'var(--txt)' }} />
                  <span onClick={submitNewCat} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>Add</span>
                  <span onClick={() => { setNewCatOpen(false); setNewCatName(''); }} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--txt2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '7px 13px', cursor: 'pointer' }}>Cancel</span>
                </div>
              ) : (
                <span onClick={() => setNewCatOpen(true)} style={{ display: 'inline-flex', fontSize: 11.5, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }}>＋ New category</span>
              ))}
            </div>
          </>
        )}

      </div>
    </div>
  );
}
