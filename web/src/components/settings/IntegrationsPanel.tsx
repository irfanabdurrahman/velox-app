// Integrations tab: REST API keys, outgoing webhooks, MCP server, intake forms.
// All data is fetched live with local state; writes are role-gated by the caller.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import { Hover } from '../Hover';
import {
  cardStyle, subCardStyle, mono, CardHead, SectionTitle, Toggle, btnStyle, inputStyle,
  Field, Chk, CopyField, Note, StateRow,
} from './kit';

const API_SCOPES = ['tasks:read', 'tasks:write', 'projects:read', 'reports:read'];
const chip: React.CSSProperties = { fontSize: 9, fontWeight: 700, borderRadius: 99, padding: '2px 8px', fontFamily: mono };
const relDate = (v: any) => (v ? `last used ${new Date(v).toLocaleDateString()}` : 'never used');

// ============================ API KEYS =====================================
type ApiKey = { id: string; name: string; prefix: string; scopes: string[]; lastUsedAt?: any; revoked?: boolean };

function ApiKeysCard({ ws, canWrite }: { ws: string; canWrite: boolean }) {
  const pushToast = useStore((s) => s.pushToast);
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [scopes, setScopes] = useState<string[]>(['tasks:read']);
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<{ name: string; key: string } | null>(null);

  useEffect(() => {
    let live = true;
    api.listApiKeys(ws).then((r) => live && setKeys(r)).catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [ws]);

  const toggleScope = (sc: string) => setScopes((p) => (p.includes(sc) ? p.filter((x) => x !== sc) : [...p, sc]));
  const create = async () => {
    if (!name.trim() || !scopes.length) { pushToast('Name and at least one scope required', 'bad'); return; }
    setBusy(true);
    try {
      const r = await api.createApiKey(ws, name.trim(), scopes);
      setFresh({ name: r.name, key: r.key });
      setKeys((p) => [{ id: r.id, name: r.name, prefix: r.prefix, scopes: r.scopes, lastUsedAt: null, revoked: false }, ...(p || [])]);
      setOpen(false); setName(''); setScopes(['tasks:read']);
    } catch (e: any) { pushToast(`Could not create key — ${e.message || e}`, 'bad'); }
    setBusy(false);
  };
  const revoke = async (k: ApiKey) => {
    if (!window.confirm(`Revoke "${k.name}"? Any integration using it will stop working.`)) return;
    try {
      await api.revokeApiKey(k.id);
      setKeys((p) => (p || []).map((x) => (x.id === k.id ? { ...x, revoked: true } : x)));
      pushToast('API key revoked');
    } catch (e: any) { pushToast(`Revoke failed — ${e.message || e}`, 'bad'); }
  };

  return (
    <div style={cardStyle}>
      <CardHead icon="🔑" iconBg="var(--accS)" title="REST API keys"
        right={canWrite ? <span onClick={() => { setOpen((o) => !o); setFresh(null); }} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accT)', cursor: 'pointer' }}>{open ? '✕ Close' : '＋ New key'}</span> : undefined} />

      {fresh && (
        <div style={{ marginBottom: 9 }}>
          <CopyField value={fresh.key} label={`New key · ${fresh.name}`} highlight />
          <Note tone="warn">⚠ Copy it now — this key won't be shown again.</Note>
        </div>
      )}

      {open && (
        <div style={{ ...subCardStyle, background: 'var(--bg)' }}>
          <Field label="Key name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. CI pipeline" /></Field>
          <SectionTitle>Scopes</SectionTitle>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 2, marginBottom: 8 }}>
            {API_SCOPES.map((sc) => <Chk key={sc} label={sc} checked={scopes.includes(sc)} onChange={() => toggleScope(sc)} />)}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <span onClick={busy ? undefined : create} style={btnStyle('primary', busy)}>{busy ? 'Creating…' : 'Create key'}</span>
            <span onClick={() => setOpen(false)} style={btnStyle('ghost')}>Cancel</span>
          </div>
        </div>
      )}

      {err && <StateRow text={`Could not load keys — ${err}`} />}
      {!err && keys === null && <StateRow text="Loading…" />}
      {!err && keys && keys.length === 0 && <StateRow text="No API keys yet." />}
      {keys?.map((k) => (
        <div key={k.id} style={{ ...subCardStyle, opacity: k.revoked ? 0.55 : 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700 }}>{k.name}</span>
            {k.revoked && <span style={{ ...chip, background: 'var(--bdB)', color: 'var(--bdT)' }}>revoked</span>}
            <span style={{ fontSize: 9.5, color: 'var(--txt3)', marginLeft: 'auto' }}>{relDate(k.lastUsedAt)}</span>
          </div>
          <div style={{ fontSize: 10.5, fontFamily: mono, color: 'var(--txt3)', margin: '3px 0 5px' }}>{k.prefix}…</div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
            {(k.scopes || []).map((sc) => <span key={sc} style={{ ...chip, background: 'var(--muB)', color: 'var(--muT)' }}>{sc}</span>)}
            {canWrite && !k.revoked && <Hover as="span" onClick={() => revoke(k)} style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer', marginLeft: 'auto' }} hover={{ color: 'var(--bdT)' }}>Revoke</Hover>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ WEBHOOKS ======================================
type Webhook = { id: string; url: string; events: string[]; secret: string; active: boolean };
type CatEvent = { event: string; description: string };

function WebhooksCard({ ws, canWrite }: { ws: string; canWrite: boolean }) {
  const pushToast = useStore((s) => s.pushToast);
  const [hooks, setHooks] = useState<Webhook[] | null>(null);
  const [err, setErr] = useState('');
  const [catalog, setCatalog] = useState<CatEvent[]>([]);
  const [open, setOpen] = useState(false);
  const [url, setUrl] = useState('');
  const [events, setEvents] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [tested, setTested] = useState<Record<string, string>>({});

  useEffect(() => {
    let live = true;
    api.listWebhooks(ws).then((r) => live && setHooks(r)).catch((e) => live && setErr(String(e.message || e)));
    api.eventCatalog().then((r) => live && setCatalog(r)).catch(() => {});
    return () => { live = false; };
  }, [ws]);

  const toggleEv = (ev: string) => setEvents((p) => (p.includes(ev) ? p.filter((x) => x !== ev) : [...p, ev]));
  const create = async () => {
    if (!url.trim() || !events.length) { pushToast('URL and at least one event required', 'bad'); return; }
    setBusy(true);
    try {
      const wh = await api.createWebhook(ws, url.trim(), events);
      setHooks((p) => [wh, ...(p || [])]);
      setOpen(false); setUrl(''); setEvents([]);
    } catch (e: any) { pushToast(`Could not create webhook — ${e.message || e}`, 'bad'); }
    setBusy(false);
  };
  const toggleActive = async (wh: Webhook) => {
    const next = !wh.active;
    setHooks((p) => (p || []).map((x) => (x.id === wh.id ? { ...x, active: next } : x)));
    try { await api.patchWebhook(wh.id, { active: next }); }
    catch (e: any) { setHooks((p) => (p || []).map((x) => (x.id === wh.id ? { ...x, active: wh.active } : x))); pushToast(`Update failed — ${e.message || e}`, 'bad'); }
  };
  const test = async (wh: Webhook) => {
    setTested((t) => ({ ...t, [wh.id]: '…sending' }));
    try {
      const r = await api.testWebhook(wh.id);
      setTested((t) => ({ ...t, [wh.id]: r.ok ? `delivered · HTTP ${r.status}` : r.status ? `failed · HTTP ${r.status}` : 'no response (connection failed)' }));
    } catch (e: any) { setTested((t) => ({ ...t, [wh.id]: `error · ${e.message || e}` })); }
  };
  const del = async (wh: Webhook) => {
    if (!window.confirm('Delete this webhook endpoint?')) return;
    try { await api.delWebhook(wh.id); setHooks((p) => (p || []).filter((x) => x.id !== wh.id)); pushToast('Webhook deleted'); }
    catch (e: any) { pushToast(`Delete failed — ${e.message || e}`, 'bad'); }
  };

  return (
    <div style={cardStyle}>
      <CardHead icon="📡" iconBg="var(--waB)" title="Outgoing webhooks"
        right={canWrite ? <span onClick={() => setOpen((o) => !o)} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accT)', cursor: 'pointer' }}>{open ? '✕ Close' : '＋ New'}</span> : undefined} />

      {open && (
        <div style={{ ...subCardStyle, background: 'var(--bg)' }}>
          <Field label="Endpoint URL"><input style={inputStyle} value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://hooks.example.com/velox" /></Field>
          <SectionTitle>Events</SectionTitle>
          <div style={{ marginBottom: 8, maxHeight: 150, overflowY: 'auto' }}>
            {catalog.map((c) => <Chk key={c.event} label={c.event} checked={events.includes(c.event)} onChange={() => toggleEv(c.event)} />)}
          </div>
          <div style={{ display: 'flex', gap: 7 }}>
            <span onClick={busy ? undefined : create} style={btnStyle('primary', busy)}>{busy ? 'Creating…' : 'Create webhook'}</span>
            <span onClick={() => setOpen(false)} style={btnStyle('ghost')}>Cancel</span>
          </div>
        </div>
      )}

      {err && <StateRow text={`Could not load — ${err}`} />}
      {!err && hooks === null && <StateRow text="Loading…" />}
      {!err && hooks && hooks.length === 0 && <StateRow text="No webhooks configured." />}
      {hooks?.map((wh) => (
        <div key={wh.id} style={subCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 10.5, fontFamily: mono, flex: 1, minWidth: 0, wordBreak: 'break-all' }}>{wh.url}</span>
            <Toggle on={wh.active} onClick={canWrite ? () => toggleActive(wh) : undefined} />
          </div>
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', margin: '6px 0' }}>
            {(wh.events || []).map((ev) => <span key={ev} style={{ ...chip, background: 'var(--accS)', color: 'var(--accT)' }}>{ev}</span>)}
          </div>
          <CopyField value={wh.secret} label="Signing secret (HMAC-SHA256)" />
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
            <span onClick={() => test(wh)} style={btnStyle('ghost')}>Test</span>
            {canWrite && <Hover as="span" onClick={() => del(wh)} style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer' }} hover={{ color: 'var(--bdT)' }}>Delete</Hover>}
            {tested[wh.id] && <span style={{ fontSize: 10, color: 'var(--txt2)', marginLeft: 'auto' }}>{tested[wh.id]}</span>}
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================ MCP SERVER ====================================
type McpManifest = { name: string; version: string; description: string; auth: string; tools: { name: string; description: string; scope: string }[] };

function McpCard() {
  const [m, setM] = useState<McpManifest | null>(null);
  const [err, setErr] = useState('');
  const endpoint = `${location.origin}/api/mcp`;
  useEffect(() => {
    let live = true;
    api.mcpManifest().then((r) => live && setM(r)).catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, []);
  return (
    <div style={{ ...cardStyle, border: '1.5px solid var(--acc2)', boxShadow: '0 4px 18px var(--ring)' }}>
      <CardHead title="MCP Server" iconBg="linear-gradient(135deg,var(--acc),var(--acc2))"
        icon={<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>} />
      <div style={{ fontSize: 11, color: 'var(--txt2)', lineHeight: 1.5, marginBottom: 9 }}>Connect external AI agents (Claude, and other MCP clients) to read &amp; act on this workspace over JSON/HTTP.</div>
      <CopyField value={endpoint} label="Endpoint" />
      <Note>External agents authenticate with a workspace <b>API key</b> (<span style={{ fontFamily: mono }}>Authorization: Bearer vlx_live_…</span>). Each call is scoped to that key's workspace &amp; scopes.</Note>
      <div style={{ marginTop: 10 }}>
        <SectionTitle>Exposed tools {m && `(${m.tools.length})`}</SectionTitle>
        {err && <StateRow text={`Could not load manifest — ${err}`} />}
        {!err && !m && <StateRow text="Loading…" />}
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          {m?.tools.map((t) => <span key={t.name} title={`${t.description} · scope: ${t.scope}`} style={{ fontSize: 9, fontWeight: 700, background: 'var(--accS)', color: 'var(--accT)', borderRadius: 99, padding: '2px 8px', fontFamily: mono }}>{t.name}</span>)}
        </div>
      </div>
    </div>
  );
}

// ============================ FORMS =========================================
type FormField = { key: string; label: string; type: string; required: boolean };
type IntakeForm = { id: string; name: string; projectId: string; fields: FormField[] };
const FIELD_TYPES = ['text', 'textarea', 'number', 'email', 'date'];

function FormsCard({ ws, canWrite }: { ws: string; canWrite: boolean }) {
  const pushToast = useStore((s) => s.pushToast);
  // select the stable array, then filter in a memo — filtering inside the
  // selector returns a fresh array each render and loops useSyncExternalStore.
  const allProjects = useStore((s) => s.projects);
  const projects = useMemo(() => allProjects.filter((p) => p.ws === ws), [allProjects, ws]);
  const [forms, setForms] = useState<IntakeForm[] | null>(null);
  const [err, setErr] = useState('');
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [projectId, setProjectId] = useState('');
  const [fields, setFields] = useState<FormField[]>([{ key: 'summary', label: 'Summary', type: 'text', required: true }]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.listForms(ws).then((r) => live && setForms(r)).catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [ws]);

  const setField = (i: number, patch: Partial<FormField>) => setFields((p) => p.map((f, idx) => (idx === i ? { ...f, ...patch } : f)));
  const create = async () => {
    const pid = projectId || projects[0]?.id;
    if (!name.trim() || !pid) { pushToast('Name and target project required', 'bad'); return; }
    const clean = fields.filter((f) => f.key.trim());
    setBusy(true);
    try {
      const f = await api.createForm(ws, { name: name.trim(), projectId: pid, fields: clean });
      setForms((p) => [f, ...(p || [])]);
      setOpen(false); setName(''); setProjectId(''); setFields([{ key: 'summary', label: 'Summary', type: 'text', required: true }]);
    } catch (e: any) { pushToast(`Could not create form — ${e.message || e}`, 'bad'); }
    setBusy(false);
  };
  const del = async (f: IntakeForm) => {
    if (!window.confirm(`Delete form "${f.name}"?`)) return;
    try { await api.delForm(f.id); setForms((p) => (p || []).filter((x) => x.id !== f.id)); pushToast('Form deleted'); }
    catch (e: any) { pushToast(`Delete failed — ${e.message || e}`, 'bad'); }
  };
  const projName = (id: string) => projects.find((p) => p.id === id)?.name || id;

  return (
    <div style={cardStyle}>
      <CardHead icon="📥" iconBg="var(--inB)" title="Intake forms"
        right={canWrite ? <span onClick={() => setOpen((o) => !o)} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accT)', cursor: 'pointer' }}>{open ? '✕ Close' : '＋ New'}</span> : undefined} />

      {open && (
        <div style={{ ...subCardStyle, background: 'var(--bg)' }}>
          <Field label="Form name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Bug report" /></Field>
          <Field label="Target project">
            <select style={inputStyle} value={projectId || projects[0]?.id || ''} onChange={(e) => setProjectId(e.target.value)}>
              {projects.length === 0 && <option value="">No projects in this workspace</option>}
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
          <SectionTitle>Fields</SectionTitle>
          {fields.map((f, i) => (
            <div key={i} style={{ display: 'flex', gap: 5, marginBottom: 5, alignItems: 'center' }}>
              <input style={{ ...inputStyle, flex: 1 }} value={f.key} onChange={(e) => setField(i, { key: e.target.value })} placeholder="key" />
              <input style={{ ...inputStyle, flex: 1 }} value={f.label} onChange={(e) => setField(i, { label: e.target.value })} placeholder="label" />
              <select style={{ ...inputStyle, width: 84, flex: 'none' }} value={f.type} onChange={(e) => setField(i, { type: e.target.value })}>
                {FIELD_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <span onClick={() => setField(i, { required: !f.required })} title="Required" style={{ fontSize: 10, fontWeight: 700, cursor: 'pointer', color: f.required ? 'var(--accT)' : 'var(--txt3)', flex: 'none' }}>req</span>
              {fields.length > 1 && <span onClick={() => setFields((p) => p.filter((_, idx) => idx !== i))} style={{ cursor: 'pointer', color: 'var(--txt3)', flex: 'none' }}>✕</span>}
            </div>
          ))}
          <span onClick={() => setFields((p) => [...p, { key: '', label: '', type: 'text', required: false }])} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accT)', cursor: 'pointer', display: 'inline-block', margin: '2px 0 9px' }}>＋ Add field</span>
          <div style={{ display: 'flex', gap: 7 }}>
            <span onClick={busy ? undefined : create} style={btnStyle('primary', busy)}>{busy ? 'Creating…' : 'Create form'}</span>
            <span onClick={() => setOpen(false)} style={btnStyle('ghost')}>Cancel</span>
          </div>
        </div>
      )}

      {err && <StateRow text={`Could not load — ${err}`} />}
      {!err && forms === null && <StateRow text="Loading…" />}
      {!err && forms && forms.length === 0 && <StateRow text="No intake forms yet." />}
      {forms?.map((f) => (
        <div key={f.id} style={subCardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5 }}>
            <span style={{ fontSize: 11.5, fontWeight: 700, flex: 1 }}>{f.name}</span>
            <span style={{ fontSize: 9.5, color: 'var(--txt3)' }}>→ {projName(f.projectId)}</span>
            {canWrite && <Hover as="span" onClick={() => del(f)} style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer' }} hover={{ color: 'var(--bdT)' }}>Delete</Hover>}
          </div>
          <CopyField value={`${location.origin}/api/forms/${f.id}/submit`} label="Public submit URL (POST JSON)" />
          <Note>Public submissions auto-create a task in <b>{projName(f.projectId)}</b>.</Note>
        </div>
      ))}
    </div>
  );
}

export function IntegrationsPanel({ ws, canWrite }: { ws: string; canWrite: boolean }) {
  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Integrations</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Connect Velox to your stack — API keys, webhooks, MCP agents, and intake forms.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(330px,1fr))', gap: 11, alignItems: 'start' }}>
        <ApiKeysCard ws={ws} canWrite={canWrite} />
        <WebhooksCard ws={ws} canWrite={canWrite} />
        <McpCard />
        <FormsCard ws={ws} canWrite={canWrite} />
      </div>
    </>
  );
}
