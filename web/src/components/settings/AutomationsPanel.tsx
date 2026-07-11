// Automations tab: a WHEN → THEN rule builder over api.listRules/createRule etc.
import { useEffect, useMemo, useState } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import { Hover } from '../Hover';
import { stMeta } from '../../lib/meta';
import { cardStyle, subCardStyle, CardHead, SectionTitle, Toggle, btnStyle, inputStyle, Field, StateRow } from './kit';

const STATUSES = ['mut', 'prog', 'risk', 'bad', 'done'];
const stLabel = (s: string) => stMeta(s).l;

const TRIGGERS: [string, string][] = [
  ['status.changed', 'Status changes to…'],
  ['task.created', 'A task is created'],
  ['comment.added', 'A comment is added'],
  ['due.soon', 'A task is due soon'],
];
const ACTIONS: [string, string][] = [
  ['set_status', 'Set status to…'],
  ['assign', 'Assign to…'],
  ['add_comment', 'Add a comment'],
  ['notify', 'Notify someone'],
];

type Rule = { id: string; name: string; trigger: any; action: any; active: boolean };

export function AutomationsPanel({ ws, canWrite }: { ws: string; canWrite: boolean }) {
  const pushToast = useStore((s) => s.pushToast);
  const members = useStore((s) => s.members);
  const memberships = useStore((s) => s.memberships);
  const wsMembers = useMemo(() => memberships.filter((m) => m.ws === ws).map((m) => m.userId).filter((id) => members[id]), [memberships, members, ws]);
  const nameOf = (id: string) => members[id]?.n || id;

  const [rules, setRules] = useState<Rule[] | null>(null);
  const [err, setErr] = useState('');
  const [name, setName] = useState('');
  const [trigType, setTrigType] = useState('status.changed');
  const [trigTo, setTrigTo] = useState('bad');
  const [actType, setActType] = useState('notify');
  const [actStatus, setActStatus] = useState('prog');
  const [actUser, setActUser] = useState('');
  const [actText, setActText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.listRules(ws).then((r) => live && setRules(r)).catch((e) => live && setErr(String(e.message || e)));
    return () => { live = false; };
  }, [ws]);

  const buildTrigger = () => (trigType === 'status.changed' ? { type: trigType, to: trigTo } : { type: trigType });
  const buildAction = () => {
    const u = actUser || wsMembers[0] || '';
    if (actType === 'set_status') return { type: 'set_status', value: actStatus };
    if (actType === 'assign') return { type: 'assign', userId: u };
    if (actType === 'add_comment') return { type: 'add_comment', text: actText };
    return { type: 'notify', userId: u, text: actText };
  };
  const describeTrigger = (t: any) => {
    switch (t?.type) {
      case 'status.changed': return `status changes to ${stLabel(t.to)}`;
      case 'task.created': return 'a task is created';
      case 'comment.added': return 'a comment is added';
      case 'due.soon': return 'a task is due soon';
      default: return t?.type || '—';
    }
  };
  const describeAction = (a: any) => {
    switch (a?.type) {
      case 'set_status': return `set status → ${stLabel(a.value)}`;
      case 'assign': return `assign to ${nameOf(a.userId)}`;
      case 'add_comment': return `add comment "${a.text}"`;
      case 'notify': return `notify ${nameOf(a.userId)}${a.text ? `: "${a.text}"` : ''}`;
      default: return a?.type || '—';
    }
  };

  const needsText = actType === 'add_comment' || actType === 'notify';
  const needsUser = actType === 'assign' || actType === 'notify';
  const create = async () => {
    if (!name.trim()) { pushToast('Rule name required', 'bad'); return; }
    if (needsText && !actText.trim()) { pushToast('Message text required for this action', 'bad'); return; }
    if (needsUser && !(actUser || wsMembers[0])) { pushToast('Pick a member for this action', 'bad'); return; }
    setBusy(true);
    try {
      const r = await api.createRule(ws, { name: name.trim(), trigger: buildTrigger(), action: buildAction() });
      setRules((p) => [r, ...(p || [])]);
      setName(''); setActText('');
    } catch (e: any) { pushToast(`Could not create rule — ${e.message || e}`, 'bad'); }
    setBusy(false);
  };
  const toggle = async (r: Rule) => {
    const next = !r.active;
    setRules((p) => (p || []).map((x) => (x.id === r.id ? { ...x, active: next } : x)));
    try { await api.patchRule(r.id, { active: next }); }
    catch (e: any) { setRules((p) => (p || []).map((x) => (x.id === r.id ? { ...x, active: r.active } : x))); pushToast(`Update failed — ${e.message || e}`, 'bad'); }
  };
  const del = async (r: Rule) => {
    if (!window.confirm(`Delete rule "${r.name}"?`)) return;
    try { await api.delRule(r.id); setRules((p) => (p || []).filter((x) => x.id !== r.id)); pushToast('Rule deleted'); }
    catch (e: any) { pushToast(`Delete failed — ${e.message || e}`, 'bad'); }
  };

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Automations</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>When <b>[trigger]</b> → then <b>[action]</b>. No code.</div>

      {canWrite && (
        <div style={{ ...cardStyle, maxWidth: 560, marginBottom: 16, border: '1.5px dashed var(--line)' }}>
          <CardHead icon="✨" iconBg="var(--accS)" title="New rule" />
          <Field label="Rule name"><input style={inputStyle} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Escalate overdue" /></Field>
          <SectionTitle style={{ color: 'var(--waT)' }}>When</SectionTitle>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
            <select style={inputStyle} value={trigType} onChange={(e) => setTrigType(e.target.value)}>{TRIGGERS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            {trigType === 'status.changed' && <select style={{ ...inputStyle, width: 150, flex: 'none' }} value={trigTo} onChange={(e) => setTrigTo(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{stLabel(s)}</option>)}</select>}
          </div>
          <SectionTitle style={{ color: 'var(--accT)' }}>Then</SectionTitle>
          <div style={{ display: 'flex', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
            <select style={{ ...inputStyle, width: 180, flex: 'none' }} value={actType} onChange={(e) => setActType(e.target.value)}>{ACTIONS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
            {actType === 'set_status' && <select style={{ ...inputStyle, width: 150, flex: 'none' }} value={actStatus} onChange={(e) => setActStatus(e.target.value)}>{STATUSES.map((s) => <option key={s} value={s}>{stLabel(s)}</option>)}</select>}
            {needsUser && <select style={{ ...inputStyle, width: 170, flex: 'none' }} value={actUser || wsMembers[0] || ''} onChange={(e) => setActUser(e.target.value)}>{wsMembers.length === 0 && <option value="">No members</option>}{wsMembers.map((id) => <option key={id} value={id}>{nameOf(id)}</option>)}</select>}
            {needsText && <input style={{ ...inputStyle, flex: 1, minWidth: 160 }} value={actText} onChange={(e) => setActText(e.target.value)} placeholder="Message text" />}
          </div>
          <span onClick={busy ? undefined : create} style={btnStyle('primary', busy)}>{busy ? 'Adding…' : '＋ Add rule'}</span>
        </div>
      )}

      {err && <StateRow text={`Could not load rules — ${err}`} />}
      {!err && rules === null && <StateRow text="Loading…" />}
      {!err && rules && rules.length === 0 && <StateRow text="No automation rules yet." />}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(320px,1fr))', gap: 11, alignItems: 'start' }}>
        {rules?.map((r) => (
          <div key={r.id} style={{ ...cardStyle, opacity: r.active ? 1 : 0.6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
              <span style={{ fontSize: 12.5, fontWeight: 800, flex: 1 }}>{r.name}</span>
              <Toggle on={r.active} onClick={canWrite ? () => toggle(r) : undefined} />
            </div>
            <div style={{ fontSize: 11, color: 'var(--txt2)', lineHeight: 1.55 }}>
              <span style={{ fontWeight: 700, color: 'var(--waT)' }}>WHEN</span> {describeTrigger(r.trigger)}<br />
              <span style={{ fontWeight: 700, color: 'var(--accT)' }}>THEN</span> {describeAction(r.action)}
            </div>
            {canWrite && <Hover as="span" onClick={() => del(r)} style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer', marginTop: 8, alignSelf: 'flex-start' }} hover={{ color: 'var(--bdT)' }}>Delete</Hover>}
          </div>
        ))}
      </div>
    </>
  );
}
