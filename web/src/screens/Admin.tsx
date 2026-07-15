import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { api } from '../api';

const seg = (on: boolean) => ({ bg: on ? 'var(--card)' : 'transparent', co: on ? 'var(--txt)' : 'var(--txt2)', sh: on ? 'var(--sh1)' : 'none' });

const roleC: Record<string, [string, string]> = {
  Admin: ['var(--accS)', 'var(--accT)'],
  Owner: ['var(--accS)', 'var(--accT)'],
  Manager: ['var(--inB)', 'var(--inT)'],
  Member: ['var(--muB)', 'var(--muT)'],
  Guest: ['var(--waB)', 'var(--waT)'],
  'Executive Viewer': ['var(--okB)', 'var(--okT)'],
};

const chk = (v: string) => v === 'y'
  ? { v: '✓', co: 'var(--okT)', fs: 12 }
  : v === 'r'
    ? { v: 'view', co: 'var(--txt3)', fs: 9.5 }
    : { v: '—', co: 'var(--txt3)', fs: 11 };

const matrixDef: string[][] = [
  ['View projects', 'y', 'y', 'y', 'y', 'r', 'r'],
  ['Create / edit tasks', 'y', 'y', 'y', 'y', '—', '—'],
  ['Manage project settings', 'y', 'y', 'y', '—', '—', '—'],
  ['Manage members & roles', 'y', 'y', '—', '—', '—', '—'],
  ['API keys & webhooks', 'y', 'y', '—', '—', '—', '—'],
  ['Billing', 'y', '—', '—', '—', '—', '—'],
  ['See ALL workspaces (read-only)', 'y', '—', '—', '—', '—', 'y'],
];

const GRID = '1.6fr 1.6fr 130px 110px 90px';
const AGRID = '1.3fr 1fr 1.4fr 160px';

const roleLabel: Record<string, string> = {
  OWNER: 'Owner', ADMIN: 'Admin', MANAGER: 'Manager', MEMBER: 'Member', GUEST: 'Guest', EXEC_VIEWER: 'Executive Viewer',
};

export function Admin() {
  const s = useStore();
  const [audit, setAudit] = useState<{ loading: boolean; error: string | null; rows: any[] }>({ loading: true, error: null, rows: [] });
  const [exporting, setExporting] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);

  const adVA = seg(s.adminView === 'admin');
  const adVM = seg(s.adminView === 'member');

  const wsName = (s.workspaces.find((w) => w.id === s.ws) || ({} as any)).name || '';
  const canAdmin = ['OWNER', 'ADMIN'].includes(s.myRoles[s.ws] || '');
  const isOwner = (s.myRoles[s.ws] || '') === 'OWNER';
  const online = s.online[s.ws] || [];

  const doDeleteWorkspace = async () => {
    if (delConfirm !== wsName || deleting) return;
    setDeleting(true);
    try {
      await api.deleteWorkspace(s.ws, delConfirm);
      s.pushToast(`"${wsName}" deleted`);
      setDelOpen(false); setDelConfirm('');
      await s.bootstrap(); // reconciles s.ws to a workspace that still exists
    } catch (e: any) {
      s.pushToast(e?.message || 'Failed to delete workspace', 'bad');
    } finally { setDeleting(false); }
  };

  useEffect(() => {
    if (!['OWNER', 'ADMIN'].includes(s.myRoles[s.ws] || '')) { setAudit({ loading: false, error: null, rows: [] }); return; }
    let alive = true;
    setAudit({ loading: true, error: null, rows: [] });
    api.auditLog(s.ws)
      .then((r) => { if (alive) setAudit({ loading: false, error: null, rows: r || [] }); })
      .catch((e) => { if (alive) setAudit({ loading: false, error: e?.message || 'Failed to load audit log', rows: [] }); });
    return () => { alive = false; };
  }, [s.ws]); // eslint-disable-line react-hooks/exhaustive-deps

  const doExport = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const data = await api.exportWs(s.ws);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'velox-export.json';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      s.pushToast('Workspace data exported');
    } catch (e: any) {
      s.pushToast(e?.message || 'Export failed', 'bad');
    } finally { setExporting(false); }
  };

  const rows = s.memberships
    .filter((ms) => ms.ws === s.ws && s.members[ms.userId])
    .map((ms) => {
      const k = ms.userId;
      const m = s.members[k];
      const role = roleLabel[ms.role] || ms.role;
      const rc = roleC[role] || roleC.Member;
      return {
        k, av: k, avBg: m.c, n: m.n, you: k === s.user?.id, email: m.email, role, roleBg: rc[0], roleCo: rc[1],
        active: '—', online: online.includes(k),
      };
    });

  const matrix = matrixDef.map((r) => ({ cap: r[0], cells: r.slice(1).map(chk) }));

  const toggleView = () => {
    const to = s.adminView === 'admin' ? 'member' : 'admin';
    s.set({ adminView: to });
    s.pushToast(to === 'member' ? 'Viewing as Member — Admin nav hidden' : 'Admin view restored');
  };

  if (!canAdmin) {
    return (
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px', display: 'grid', placeItems: 'center' }}>
        <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 14, padding: '40px 34px', textAlign: 'center', boxShadow: 'var(--sh1)', maxWidth: 420 }}>
          <div style={{ fontSize: 14.5, fontWeight: 800, marginBottom: 5 }}>You need admin rights in this workspace</div>
          <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>Ask a workspace Owner or Admin to grant you access to members &amp; roles.</div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 13 }}>
        <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Members &amp; roles</span>
        <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{rows.length} member{rows.length === 1 ? '' : 's'} · {wsName}</span>
        <span style={{ marginLeft: 'auto', fontSize: 11, color: 'var(--txt3)' }}>View as:</span>
        <span onClick={toggleView} style={{ display: 'flex', background: 'var(--muB)', borderRadius: 8, padding: 2, cursor: 'pointer' }}>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: adVA.bg, color: adVA.co, boxShadow: adVA.sh }}>Admin</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, padding: '3px 10px', borderRadius: 6, background: adVM.bg, color: adVM.co, boxShadow: adVM.sh }}>Member</span>
        </span>
        <Hover onClick={doExport} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 700, color: 'var(--txt2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '5px 11px', cursor: exporting ? 'default' : 'pointer', opacity: exporting ? 0.6 : 1 }} hover={{ background: 'var(--hover)' }}>
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M12 15V3M7 8l5-5 5 5M4 21h16" /></svg>{exporting ? 'Exporting…' : 'Export workspace data'}
        </Hover>
        <span onClick={() => s.pushToast('Demo preview — invites are not yet functional')} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '6px 13px', cursor: 'pointer' }}>＋ Invite</span>
      </div>

      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', overflow: 'hidden', marginBottom: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '9px 15px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)', background: 'var(--bg)' }}>
          <span>Member</span><span>Email</span><span>Role</span><span>Last active</span><span>2FA</span>
        </div>
        {rows.map((m) => (
          <Hover key={m.k} style={{ display: 'grid', gridTemplateColumns: GRID, gap: 8, padding: '8px 15px', alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 12 }} hover={{ background: 'var(--hover)' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
              <span style={{ position: 'relative', flex: 'none' }}>
                <span style={{ width: 24, height: 24, borderRadius: '50%', background: m.avBg, color: '#fff', display: 'grid', placeItems: 'center', fontSize: 8.5, fontWeight: 800 }}>{m.av}</span>
                {m.online && <span title="Online" style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', border: '2px solid var(--card)' }} />}
              </span>
              <span style={{ fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.n}</span>
              {m.you && <span style={{ fontSize: 8.5, fontWeight: 800, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '1px 6px', flex: 'none' }}>YOU</span>}
            </span>
            <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.email}</span>
            <span><span style={{ fontSize: 10, fontWeight: 700, padding: '2.5px 9px', borderRadius: 99, background: m.roleBg, color: m.roleCo, whiteSpace: 'nowrap' }}>{m.role} ▾</span></span>
            <span style={{ fontSize: 11, color: 'var(--txt3)' }}>{m.active}</span>
            <span><span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--txt3)' }}>—</span></span>
          </Hover>
        ))}
      </div>

      <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 9 }}>Permission matrix</div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', overflowX: 'auto' }}>
        <div style={{ minWidth: 760 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.7fr repeat(6,1fr)', padding: '9px 15px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)', background: 'var(--bg)' }}>
            <span>Capability</span>
            <span style={{ textAlign: 'center' }}>Owner</span>
            <span style={{ textAlign: 'center' }}>Admin</span>
            <span style={{ textAlign: 'center' }}>Manager</span>
            <span style={{ textAlign: 'center' }}>Member</span>
            <span style={{ textAlign: 'center' }}>Guest</span>
            <span style={{ textAlign: 'center', color: 'var(--accT)' }}>Exec Viewer</span>
          </div>
          {matrix.map((r) => (
            <div key={r.cap} style={{ display: 'grid', gridTemplateColumns: '1.7fr repeat(6,1fr)', padding: '7.5px 15px', alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 11.5 }}>
              <span style={{ fontWeight: 600 }}>{r.cap}</span>
              {r.cells.map((c, i) => <span key={i} style={{ textAlign: 'center', fontWeight: 800, color: c.co, fontSize: c.fs }}>{c.v}</span>)}
            </div>
          ))}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 8 }}>Executive Viewer = org-level read-only across ALL workspaces — dashboards, projects, and reports, no editing.</div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '18px 0 9px' }}>
        <span style={{ fontSize: 13, fontWeight: 800 }}>Audit log</span>
        <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>recent workspace events</span>
      </div>
      <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, boxShadow: 'var(--sh1)', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: AGRID, gap: 8, padding: '9px 15px', fontSize: 9.5, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em', borderBottom: '1px solid var(--line2)', background: 'var(--bg)' }}>
          <span>Action</span><span>Actor</span><span>Target</span><span>When</span>
        </div>
        {audit.loading && <div style={{ padding: '24px 15px', textAlign: 'center', fontSize: 11.5, color: 'var(--txt3)' }}>Loading audit log…</div>}
        {!audit.loading && audit.error && <div style={{ padding: '24px 15px', textAlign: 'center', fontSize: 11.5, color: 'var(--bdT)' }}>{audit.error}</div>}
        {!audit.loading && !audit.error && audit.rows.length === 0 && <div style={{ padding: '24px 15px', textAlign: 'center', fontSize: 11.5, color: 'var(--txt3)' }}>No audit events recorded yet.</div>}
        {!audit.loading && !audit.error && audit.rows.length > 0 && (
          <div style={{ maxHeight: 340, overflowY: 'auto' }}>
            {audit.rows.map((r, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: AGRID, gap: 8, padding: '8px 15px', alignItems: 'center', borderBottom: '1px solid var(--line2)', fontSize: 11.5 }}>
                <span style={{ fontWeight: 700, fontFamily: 'var(--mono, ui-monospace, monospace)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.action}</span>
                <span style={{ color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{(r.actor && s.members[r.actor]?.n) || r.actor || 'system'}</span>
                <span style={{ color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{r.target || '—'}</span>
                <span style={{ color: 'var(--txt3)' }}>{r.createdAt ? new Date(r.createdAt).toLocaleString() : '—'}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {isOwner && (
        <div style={{ marginTop: 22 }}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 9, color: 'var(--bdT)' }}>Danger zone</div>
          <div style={{ background: 'var(--card)', border: '1px solid var(--bdB)', borderRadius: 14, padding: '15px 17px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700 }}>Delete this workspace</div>
                <div style={{ fontSize: 11, color: 'var(--txt3)', marginTop: 2 }}>
                  Permanently deletes <strong>{wsName}</strong> and everything in it — projects, tasks, chat, integrations. This cannot be undone.
                </div>
              </div>
              {!delOpen && (
                <span onClick={() => setDelOpen(true)} style={{ fontSize: 11, fontWeight: 700, color: 'var(--bdT)', background: 'var(--bdB)', border: '1px solid var(--bdT)', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', flex: 'none', whiteSpace: 'nowrap' }}>
                  Delete workspace
                </span>
              )}
            </div>
            {delOpen && (
              <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line2)' }}>
                <div style={{ fontSize: 11.5, marginBottom: 8 }}>Type <strong>{wsName}</strong> to confirm.</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={delConfirm}
                    onChange={(e) => setDelConfirm(e.target.value)}
                    placeholder={wsName}
                    autoFocus
                    style={{ flex: 1, fontSize: 12.5, padding: '8px 10px', border: '1px solid var(--line)', borderRadius: 8, background: 'var(--bg)', color: 'var(--txt)' }}
                  />
                  <span onClick={() => { setDelOpen(false); setDelConfirm(''); }} style={{ fontSize: 11, fontWeight: 700, color: 'var(--txt2)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', flex: 'none' }}>
                    Cancel
                  </span>
                  <span
                    onClick={doDeleteWorkspace}
                    style={{
                      fontSize: 11, fontWeight: 700, color: '#fff',
                      background: delConfirm === wsName ? 'var(--bd)' : 'var(--muB)',
                      borderRadius: 8, padding: '8px 14px', flex: 'none',
                      cursor: delConfirm === wsName && !deleting ? 'pointer' : 'default',
                      opacity: deleting ? 0.6 : 1,
                    }}
                  >
                    {deleting ? 'Deleting…' : 'Permanently delete'}
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
