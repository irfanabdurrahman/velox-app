import { useState, useEffect, useRef } from 'react';
import { useStore, newId } from '../store';
import { Hover } from './Hover';
import { stMeta, prMeta } from '../lib/meta';
import { fmt, TODAY } from '../lib/dates';
import { api, getToken } from '../api';
import RichText from './RichText';
import type { Dep, Task } from '../types';

const RX_PICK = ['👍', '🔥', '🙏', '✅'];
const DEP_TYPES: Array<'FS' | 'SS' | 'FF' | 'SF'> = ['FS', 'SS', 'FF', 'SF'];
const RECUR = [
  { v: '', l: 'None' },
  { v: 'daily', l: 'Daily' },
  { v: 'weekly', l: 'Weekly' },
  { v: 'monthly', l: 'Monthly' },
];

const fileMeta: Record<string, { bg: string; co: string; badge: string }> = {
  pdf: { bg: '#FEE2E2', co: '#B91C1C', badge: 'PDF' },
  xls: { bg: '#DCFCE7', co: '#15803D', badge: 'XLSX' },
  doc: { bg: '#DBEAFE', co: '#1D4ED8', badge: 'DOC' },
  img: { bg: 'linear-gradient(135deg,#818CF8,#C4B5FD)', co: '#fff', badge: 'IMG' },
  link: { bg: '#E0E7FF', co: '#4338CA', badge: 'LINK' },
  file: { bg: 'var(--muB)', co: 'var(--muT)', badge: 'FILE' },
};

const dotFor = (st: string) =>
  ({ done: 'var(--ok)', prog: 'var(--in)', risk: 'var(--wa)', bad: 'var(--bd)', mut: 'var(--txt3)' } as Record<string, string>)[st] || 'var(--txt3)';

const lagTxt = (l?: number) => (l ? `${l > 0 ? '+' : ''}${l}d` : '');
const minTxt = (m: number) => `${Math.floor(m / 60)}h ${m % 60}m`;

// Fetch an auth-protected asset as a blob URL (the <img>/anchor can't carry the
// bearer token itself). Caller owns revoking the returned object URL.
async function blobUrl(url: string): Promise<string> {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${getToken()}` }, credentials: 'include' });
  if (!r.ok) throw new Error('load failed');
  return URL.createObjectURL(await r.blob());
}

const SECTION: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em' };

export function SlideOver() {
  const s = useStore();
  const soId = s.soId;
  const storeFiles = soId ? s.files[soId] : undefined;

  const [coms, setComs] = useState<any[]>([]);
  const [rxPick, setRxPick] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyDraft, setReplyDraft] = useState('');
  const [files, setFiles] = useState<any[]>([]);
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const [lightbox, setLightbox] = useState<{ url: string; name: string } | null>(null);
  const [linkUrl, setLinkUrl] = useState('');
  const [linkName, setLinkName] = useState('');
  const [timeEntries, setTimeEntries] = useState<any[]>([]);
  const [timeMin, setTimeMin] = useState('');
  const [timeNote, setTimeNote] = useState('');
  const [chkDraft, setChkDraft] = useState('');
  const [pickA, setPickA] = useState(false);
  const [pickW, setPickW] = useState(false);
  const [depEdit, setDepEdit] = useState<{ owner: string; target: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const objUrls = useRef<string[]>([]);

  // Load threaded comments + time entries fresh on open.
  useEffect(() => {
    if (!soId) return;
    let alive = true;
    api.taskComments(soId).then((r) => { if (alive) setComs(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setComs([]); });
    api.taskTime(soId).then((r) => { if (alive) setTimeEntries(Array.isArray(r) ? r : []); }).catch(() => { if (alive) setTimeEntries([]); });
    return () => { alive = false; };
  }, [soId]);

  // Seed attachments from the store's detail cache; local uploads/deletes layer on top.
  useEffect(() => { setFiles(storeFiles ? storeFiles.slice() : []); }, [soId, storeFiles]);

  // Build thumbnails for image attachments that carry a url.
  useEffect(() => {
    files.forEach((f) => {
      if (f.k === 'img' && f.url && !thumbs[f.id]) {
        blobUrl(f.url).then((u) => { objUrls.current.push(u); setThumbs((th) => ({ ...th, [f.id]: u })); }).catch(() => {});
      }
    });
  }, [files]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset transient UI when switching tasks.
  useEffect(() => {
    setReplyTo(null); setReplyDraft(''); setDepEdit(null); setPickA(false); setPickW(false);
    setRxPick(null); setLightbox(null); setLinkUrl(''); setLinkName(''); setTimeMin(''); setTimeNote(''); setChkDraft(''); setThumbs({});
  }, [soId]);

  // Revoke object URLs on unmount.
  useEffect(() => () => { objUrls.current.forEach((u) => URL.revokeObjectURL(u)); }, []);

  if (!soId) return null;
  const t = s.task(soId);
  if (!t) return null;

  const ro = ['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws]);
  const myId = s.user?.id || 'BS';
  const proj = s.proj(t.pid);
  const par = t.par ? s.task(t.par) : null;
  const st = stMeta(t.ms ? 'mut' : t.st);
  const pr = prMeta(t.pr);
  const subs = s.kids(t.id);
  const doneN = subs.filter((x) => x.st === 'done').length;
  const subPct = subs.length ? Math.round((doneN / subs.length) * 100) : 0;
  const late = !t.ms && t.st !== 'done' && t.e != null && t.e < TODAY;

  const checklist = t.checklist || [];
  const chkDone = checklist.filter((c) => c.done).length;
  const a2 = t.a2 && t.a2.length ? t.a2 : (t.a ? [t.a] : []);
  const watchers = t.watchers || [];
  const amWatching = watchers.includes(myId);
  const cfs = s.customFields.filter((f) => f.pid === t.pid).slice().sort((a, b) => (a.ord || 0) - (b.ord || 0));
  const totalMin = timeEntries.reduce((a, e) => a + (e.minutes || 0), 0);
  const totalTxt = timeEntries.length ? minTxt(totalMin) : (t.tt || '0h');

  const wsMembers = (() => {
    const wsId = proj?.ws;
    const ids = s.memberships.filter((m) => m.ws === wsId).map((m) => m.userId);
    const uniq = Array.from(new Set(ids.length ? ids : Object.keys(s.members)));
    return uniq.filter((id) => s.members[id]);
  })();

  const blockedBy = t.deps.map((d) => ({ d, task: s.task(d.t) })).filter((x) => x.task) as { d: Dep; task: Task }[];
  const blocking = s.tasks
    .filter((x) => x.id !== t.id && (x.deps || []).some((d) => d.t === t.id))
    .map((x) => ({ task: x, d: (x.deps || []).find((d) => d.t === t.id)! }));

  const editing = depEdit ? (() => {
    const owner = s.task(depEdit.owner);
    const dep = owner?.deps.find((d) => d.t === depEdit.target);
    const targetTask = s.task(depEdit.target);
    return owner && dep && targetTask ? { owner, dep, targetTask } : null;
  })() : null;

  // ---- actions ----
  const stop = (e: React.MouseEvent) => e.stopPropagation();
  const openMenu = (field: string, e: React.MouseEvent) => {
    if (ro) return;
    e.stopPropagation();
    const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
    s.set({ cellMenu: { tid: t.id, field, x: Math.min(r.left, window.innerWidth - 230), y: r.bottom + 4 }, cmCal: { y: 2026, m: 6 } });
  };

  const setChecklist = (next: typeof checklist) => s.updateTask(t.id, { checklist: next });
  const setA2 = (next: string[]) => s.updateTask(t.id, { a2: next, a: next[0] ?? null });
  const setWatchers = (next: string[]) => s.updateTask(t.id, { watchers: next });
  const setCf = (fid: string, val: any) => s.updateTask(t.id, { cf: { ...(t.cf || {}), [fid]: val } });

  const updateDep = (ownerId: string, target: string, patch: Partial<Dep>) => {
    const owner = s.task(ownerId); if (!owner) return;
    s.updateTask(ownerId, { deps: (owner.deps || []).map((d) => (d.t === target ? { ...d, ...patch } : d)) });
  };
  const removeDep = (ownerId: string, target: string) => {
    const owner = s.task(ownerId); if (!owner) return;
    s.updateTask(ownerId, { deps: (owner.deps || []).filter((d) => d.t !== target) });
    setDepEdit(null);
  };

  const upload = async (file: File) => {
    if (ro) return;
    try { const f = await api.uploadFile(soId, file); setFiles((fs) => [...fs, f]); }
    catch (e: any) { s.pushToast(e?.message || 'Upload failed', 'bad'); }
  };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (ro) return;
    Array.from(e.dataTransfer.files || []).forEach((f) => upload(f));
  };
  const attachLink = async () => {
    const url = linkUrl.trim(); if (!url || ro) return;
    try { const f = await api.addLink(soId, url, linkName.trim() || url); setFiles((fs) => [...fs, f]); setLinkUrl(''); setLinkName(''); }
    catch (e: any) { s.pushToast(e?.message || 'Could not attach link', 'bad'); }
  };
  const removeFile = async (f: any) => {
    if (ro || !f.id) return;
    try { await api.delFile(f.id); setFiles((fs) => fs.filter((x) => x.id !== f.id)); }
    catch (e: any) { s.pushToast(e?.message || 'Delete failed', 'bad'); }
  };
  const openFile = async (f: any) => {
    if (f.k === 'link' && f.url) { window.open(f.url, '_blank', 'noopener'); return; }
    if (f.k === 'img') {
      let u = thumbs[f.id];
      if (!u) {
        if (!f.url) { s.pushToast('Preview available after re-upload', 'ai'); return; }
        try { u = await blobUrl(f.url); objUrls.current.push(u); setThumbs((th) => ({ ...th, [f.id]: u! })); }
        catch { s.pushToast('Could not load image', 'bad'); return; }
      }
      setLightbox({ url: u, name: f.n });
      return;
    }
    if (f.url) { try { const u = await blobUrl(f.url); objUrls.current.push(u); window.open(u, '_blank', 'noopener'); } catch { s.pushToast('Could not open file', 'bad'); } }
    else s.pushToast('Download available after re-upload', 'ai');
  };

  const logTime = async () => {
    const m = parseInt(timeMin, 10);
    if (!m || m < 1 || ro) return;
    try {
      const r = await api.logTime(soId, m, TODAY, timeNote.trim() || undefined);
      setTimeEntries((es) => [{ id: r.id, user: myId, minutes: m, note: timeNote.trim(), day: TODAY }, ...es]);
      setTimeMin(''); setTimeNote('');
    } catch (e: any) { s.pushToast(e?.message || 'Could not log time', 'bad'); }
  };

  // reactions: rx shape [[emoji,[userIds]]]
  const toggleLocalRx = (rx: [string, string[]][], emoji: string): [string, string[]][] => {
    const next = (rx || []).map((r) => [r[0], [...r[1]]] as [string, string[]]);
    const row = next.find((r) => r[0] === emoji);
    if (row) { const i = row[1].indexOf(myId); if (i >= 0) row[1].splice(i, 1); else row[1].push(myId); }
    else next.push([emoji, [myId]]);
    return next.filter((r) => r[1].length);
  };
  const react = async (cid: string, emoji: string) => {
    if (ro) return;
    setRxPick(null);
    setComs((cs) => cs.map((c) => (c.id === cid ? { ...c, rx: toggleLocalRx(c.rx || [], emoji) } : c)));
    try { const r = await api.reactComment(cid, emoji); setComs((cs) => cs.map((c) => (c.id === cid ? { ...c, rx: r.rx } : c))); }
    catch { setComs((cs) => cs.map((c) => (c.id === cid ? { ...c, rx: toggleLocalRx(c.rx || [], emoji) } : c))); s.pushToast('Reaction failed', 'bad'); }
  };

  const postComment = async (txt: string, parentId: string | null) => {
    txt = txt.trim(); if (!txt || ro) return;
    const temp = { id: newId('c'), who: myId, when: 'Just now', txt, rx: [], parentId };
    setComs((cs) => [...cs, temp]);
    try { const c = await api.addComment(soId, { txt, parentId }); setComs((cs) => cs.map((x) => (x.id === temp.id ? c : x))); }
    catch (e: any) { setComs((cs) => cs.filter((x) => x.id !== temp.id)); s.pushToast(e?.message || 'Comment not posted', 'bad'); }
  };

  const polishDraft = () => {
    const d = s.soComDraft.trim();
    if (!d || s.soPolishBusy) return;
    s.set({ soPolishBusy: true });
    setTimeout(() => {
      const polished = 'Update: ' + d.charAt(0).toUpperCase() + d.slice(1).replace(/\s+/g, ' ').replace(/\.*$/, '.') + ' Next step and owner are noted — will follow up by EOD Thursday.';
      s.set({ soPolishBusy: false, soComDraft: polished });
      s.pushToast('Draft polished by Velox AI', 'ai');
    }, 700);
  };
  const askAiAboutTask = () => {
    s.set((state) => ({
      aiPanel: true,
      pMsgs: [...state.pMsgs,
        { k: 'user', txt: 'Tell me about "' + t.name + '" — risks and next steps?' },
        { k: 'txt', txt: (t.st === 'risk'
          ? '"' + t.name + '" is AT RISK: ' + t.pg + '% done with due date ' + fmt(t.e ?? 0) + '. It sits on the critical chain — a slip here pushes Production restart day-for-day. Root cause: external approval latency. Recommended: (1) daily 15-min escalation stand-up, (2) pre-book the follow-on crew for ' + fmt((t.e ?? 0) + 1) + ', (3) I can draft the escalation letter now.'
          : '"' + t.name + '" looks healthy: ' + t.pg + '% done, due ' + fmt(t.e ?? 0) + '. No blocking dependencies are late. I’ll alert you if the forecast changes.') },
      ],
    }));
  };

  // Activity: only events derivable from real task data.
  const acts: { ic: string; txt: string }[] = [];
  if (t.bs != null && t.be != null && (t.bs !== t.s || t.be !== t.e)) acts.push({ ic: '📅', txt: 'Schedule shifted from baseline ' + fmt(t.bs) + ' – ' + fmt(t.be) + ' → ' + (t.s != null ? fmt(t.s) : '—') + ' – ' + (t.e != null ? fmt(t.e) : '—') });
  if (timeEntries.length) acts.push({ ic: '⏱', txt: totalTxt + ' logged across ' + timeEntries.length + ' entr' + (timeEntries.length > 1 ? 'ies' : 'y') });
  if (files.length) acts.push({ ic: '📎', txt: files.length + ' attachment' + (files.length > 1 ? 's' : '') });
  if (checklist.length) acts.push({ ic: '☑', txt: 'Checklist ' + chkDone + '/' + checklist.length + ' complete' });
  acts.push({ ic: '⟳', txt: 'Current status: ' + (t.ms ? 'Milestone' : st.l) });
  acts.push({ ic: '＋', txt: 'Task created' });

  const crumb = (proj?.name || '') + (par ? ' / ' + par.name : '') + ' / ' + (t.ms ? 'Milestone' : 'Task');

  // ---- shared bits ----
  const memAvatar = (id: string, size = 22) => (
    <span style={{ width: size, height: size, borderRadius: '50%', background: s.members[id]?.c || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: size * 0.4, fontWeight: 800, flex: 'none' }}>{id}</span>
  );
  const selectStyle: React.CSSProperties = { fontSize: 11.5, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 7, padding: '4px 8px', background: 'var(--inputBg)', color: 'var(--txt)', cursor: ro ? 'default' : 'pointer' };
  const popover: React.CSSProperties = { position: 'absolute', top: '100%', left: 0, marginTop: 4, zIndex: 60, background: 'var(--glass)', backdropFilter: 'blur(14px)', border: '1px solid var(--line)', borderRadius: 10, boxShadow: 'var(--sh3)', padding: 5, minWidth: 180, maxHeight: 220, overflowY: 'auto' };

  const memberPicker = (open: boolean, close: () => void, exclude: string[], onPick: (id: string) => void) => {
    const cands = wsMembers.filter((id) => !exclude.includes(id));
    return open ? (
      <div style={popover} onMouseDown={stop}>
        {cands.map((id) => (
          <Hover key={id} onClick={() => { onPick(id); close(); }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 7px', borderRadius: 7, cursor: 'pointer' }} hover={{ background: 'var(--hover)' }}>
            {memAvatar(id, 20)}<span style={{ fontSize: 12, color: 'var(--txt)' }}>{s.members[id]?.n || id}</span>
          </Hover>
        ))}
        {!cands.length && <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '6px 7px' }}>Everyone added</div>}
      </div>
    ) : null;
  };

  const removeChip = (onClick: () => void) => (
    !ro ? <span onClick={onClick} style={{ cursor: 'pointer', color: 'var(--txt3)', fontSize: 11, marginLeft: 1, fontWeight: 700 }}>×</span> : null
  );

  const depChip = (ownerId: string, task: Task, dep: Dep, editTarget: string, key: string) => (
    <Hover key={key} as="span" onClick={() => (ro ? s.openTask(task.id) : setDepEdit({ owner: ownerId, target: editTarget }))} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 99, padding: '3.5px 9px', cursor: 'pointer', color: 'var(--txt2)' }} hover={{ borderColor: 'var(--acc)', color: 'var(--accT)' }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotFor(task.st) }} />{task.name}
      <span style={{ fontSize: 9, fontWeight: 800, background: 'var(--accS)', color: 'var(--accT)', borderRadius: 5, padding: '1px 5px' }}>{dep.type || 'FS'}{dep.lag ? ' ' + lagTxt(dep.lag) : ''}</span>
    </Hover>
  );

  const cfRow = (f: any) => {
    const val = (t.cf || {})[f.id];
    let ctrl: React.ReactNode;
    if (f.kind === 'dropdown') {
      const opts: string[] = f.config?.options || [];
      ctrl = <select disabled={ro} value={val ?? ''} onChange={(e) => setCf(f.id, e.target.value || null)} style={selectStyle}><option value="">—</option>{opts.map((o) => <option key={o} value={o}>{o}</option>)}</select>;
    } else if (f.kind === 'people') {
      ctrl = <select disabled={ro} value={val ?? ''} onChange={(e) => setCf(f.id, e.target.value || null)} style={selectStyle}><option value="">Unassigned</option>{wsMembers.map((id) => <option key={id} value={id}>{s.members[id]?.n || id}</option>)}</select>;
    } else if (f.kind === 'date') {
      ctrl = <input disabled={ro} type="date" value={val ?? ''} onChange={(e) => setCf(f.id, e.target.value || null)} style={{ ...selectStyle, cursor: 'text' }} />;
    } else if (f.kind === 'number' || f.kind === 'currency') {
      ctrl = <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {f.kind === 'currency' && <span style={{ fontSize: 10.5, color: 'var(--txt3)', fontWeight: 700 }}>{f.config?.code || '$'}</span>}
        <input disabled={ro} key={f.id + ':' + (val ?? '')} type="number" defaultValue={val ?? ''} onBlur={(e) => setCf(f.id, e.target.value === '' ? null : Number(e.target.value))} style={{ ...selectStyle, cursor: 'text', width: 110 }} />
      </span>;
    } else {
      ctrl = <input disabled={ro} key={f.id + ':' + (val ?? '')} type="text" defaultValue={val ?? ''} onBlur={(e) => setCf(f.id, e.target.value || null)} placeholder="—" style={{ ...selectStyle, cursor: 'text', width: '100%' }} />;
    }
    return (<><span style={{ color: 'var(--txt3)' }}>{f.name}</span><span style={{ justifySelf: 'start' }}>{ctrl}</span></>);
  };

  // ---- comment tree ----
  const roots = coms.filter((c) => !c.parentId);
  const kidsOf = (id: string) => coms.filter((c) => c.parentId === id);

  const commentBlock = (c: any, isReply: boolean) => (
    <div key={c.id} style={{ display: 'flex', gap: 9, marginBottom: 12, marginLeft: isReply ? 26 : 0 }}>
      <span style={{ width: isReply ? 22 : 26, height: isReply ? 22 : 26, borderRadius: '50%', background: s.members[c.who]?.c || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flex: 'none' }}>{c.who}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}><span style={{ fontSize: 12, fontWeight: 700 }}>{s.members[c.who]?.n || c.who}</span><span style={{ fontSize: 10, color: 'var(--txt3)' }}>{c.when}</span></div>
        <div style={{ fontSize: 12.5, lineHeight: 1.5, color: 'var(--txt)', margin: '2px 0 5px' }}>{c.txt}</div>
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', alignItems: 'center' }}>
          {(c.rx || []).map((r: [string, string[]], ri: number) => {
            const mine = (r[1] || []).includes(myId);
            return <span key={ri} onClick={() => react(c.id, r[0])} title={mine ? 'Remove your reaction' : 'React'} style={{ fontSize: 10.5, border: '1px solid ' + (mine ? 'var(--acc)' : 'var(--acc2)'), background: mine ? 'var(--acc2)' : 'var(--accS)', color: mine ? '#fff' : 'var(--txt)', fontWeight: mine ? 700 : 400, borderRadius: 99, padding: '2px 8px', cursor: ro ? 'default' : 'pointer' }}>{r[0]} {(r[1] || []).length}</span>;
          })}
          {!ro && <Hover as="span" onClick={() => setRxPick(rxPick === c.id ? null : c.id)} style={{ position: 'relative', fontSize: 10.5, color: 'var(--txt3)', border: '1px dashed var(--line)', borderRadius: 99, padding: '2px 8px', cursor: 'pointer' }} hover={{ color: 'var(--accT)' }}>＋ 😊
            {rxPick === c.id && (
              <span onMouseDown={stop} style={{ position: 'absolute', top: '100%', left: 0, marginTop: 3, display: 'inline-flex', gap: 3, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '3px 6px', boxShadow: 'var(--sh2)', zIndex: 60 }}>
                {RX_PICK.map((em) => <Hover key={em} as="span" onClick={() => react(c.id, em)} style={{ fontSize: 13, cursor: 'pointer', padding: '0 3px', borderRadius: 6 }} hover={{ background: 'var(--hover)' }}>{em}</Hover>)}
              </span>
            )}
          </Hover>}
          {!ro && !isReply && <span onClick={() => { setReplyTo(replyTo === c.id ? null : c.id); setReplyDraft(''); }} style={{ fontSize: 10.5, color: 'var(--txt3)', cursor: 'pointer', fontWeight: 600 }}>Reply</span>}
        </div>
        {replyTo === c.id && !ro && (
          <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
            <input autoFocus value={replyDraft} onChange={(e) => setReplyDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') { postComment(replyDraft, c.id); setReplyDraft(''); setReplyTo(null); } }} placeholder="Reply…" style={{ flex: 1, fontSize: 12, border: '1px solid var(--line)', borderRadius: 8, padding: '6px 9px', background: 'var(--inputBg)', color: 'var(--txt)' }} />
            <span onClick={() => { postComment(replyDraft, c.id); setReplyDraft(''); setReplyTo(null); }} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 7, padding: '5px 12px', cursor: 'pointer', alignSelf: 'center' }}>Reply</span>
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div onMouseDown={stop} style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(520px,92vw)', background: 'var(--panel)', borderLeft: '1px solid var(--line)', boxShadow: 'var(--sh3)', zIndex: 40, display: 'flex', flexDirection: 'column', animation: 'vslide .22s cubic-bezier(.2,.8,.3,1)' }}>
      <div style={{ flex: 'none', padding: '12px 16px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 11, color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1 }}>{crumb}</span>
        {ro && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--txt3)', border: '1px solid var(--line)', borderRadius: 99, padding: '2px 7px' }}>View only</span>}
        <svg onClick={() => s.set({ soId: null })} title="Close" style={{ cursor: 'pointer', flex: 'none' }} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '6px 16px 16px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 9, margin: '4px 0 10px' }}>
          <span onClick={() => !ro && s.updateTask(t.id, { st: t.st === 'done' ? 'prog' : 'done', pg: t.st === 'done' ? t.pg : 100 })} style={{ width: 20, height: 20, borderRadius: '50%', border: '2px solid ' + (t.st === 'done' ? 'var(--ok)' : 'var(--txt3)'), background: t.st === 'done' ? 'var(--ok)' : 'transparent', display: 'grid', placeItems: 'center', cursor: ro ? 'default' : 'pointer', flex: 'none', marginTop: 3 }}>
            {t.st === 'done' && <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
          </span>
          <Hover as="input" value={t.name} readOnly={ro} onChange={(e: any) => s.updateTask(t.id, { name: e.target.value })} style={{ flex: 1, fontSize: 17, fontWeight: 700, color: 'var(--txt)', background: 'transparent', border: 'none', letterSpacing: '-.01em', padding: '2px 4px', borderRadius: 6 }} hover={{ background: ro ? 'transparent' : 'var(--hover)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '7px 10px', alignItems: 'center', fontSize: 12.5, marginBottom: 14 }}>
          <span style={{ color: 'var(--txt3)' }}>Status</span>
          <span onClick={(e) => openMenu('st', e)} style={{ justifySelf: 'start', fontSize: 11, fontWeight: 700, padding: '4px 11px', borderRadius: 99, background: st.b, color: st.t, cursor: ro ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}>{t.ms ? 'Milestone' : st.l}{!ro && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>}</span>

          <span style={{ color: 'var(--txt3)', alignSelf: 'start', paddingTop: 4 }}>Assignees</span>
          <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {a2.map((id) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '2px 8px 2px 2px' }}>
                {memAvatar(id, 20)}<span style={{ fontSize: 11.5, fontWeight: 600 }}>{s.members[id]?.n || id}</span>{removeChip(() => setA2(a2.filter((x) => x !== id)))}
              </span>
            ))}
            {!ro && <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Hover as="span" onClick={() => { setPickA((v) => !v); setPickW(false); }} style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--txt3)', display: 'grid', placeItems: 'center', color: 'var(--txt3)', cursor: 'pointer', fontSize: 13 }} hover={{ borderColor: 'var(--acc)', color: 'var(--accT)' }}>+</Hover>
              {memberPicker(pickA, () => setPickA(false), a2, (id) => setA2([...a2, id]))}
            </span>}
            {!a2.length && ro && <span style={{ color: 'var(--txt3)', fontSize: 11.5 }}>Unassigned</span>}
          </span>

          <span style={{ color: 'var(--txt3)', alignSelf: 'start', paddingTop: 4 }}>Watchers</span>
          <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {watchers.map((id) => (
              <span key={id} style={{ display: 'inline-flex', alignItems: 'center', gap: 4, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '2px 7px 2px 2px' }}>
                {memAvatar(id, 18)}<span style={{ fontSize: 11, fontWeight: 600 }}>{s.members[id]?.n || id}</span>{removeChip(() => setWatchers(watchers.filter((x) => x !== id)))}
              </span>
            ))}
            {!ro && <span style={{ position: 'relative', display: 'inline-flex' }}>
              <Hover as="span" onClick={() => { setPickW((v) => !v); setPickA(false); }} style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--txt3)', display: 'grid', placeItems: 'center', color: 'var(--txt3)', cursor: 'pointer', fontSize: 12 }} hover={{ borderColor: 'var(--acc)', color: 'var(--accT)' }}>+</Hover>
              {memberPicker(pickW, () => setPickW(false), watchers, (id) => setWatchers([...watchers, id]))}
            </span>}
            {!ro && <Hover as="span" onClick={() => setWatchers(amWatching ? watchers.filter((x) => x !== myId) : [...watchers, myId])} style={{ fontSize: 10.5, fontWeight: 700, borderRadius: 99, padding: '3px 10px', cursor: 'pointer', border: '1px solid ' + (amWatching ? 'var(--acc)' : 'var(--line)'), background: amWatching ? 'var(--accS)' : 'transparent', color: amWatching ? 'var(--accT)' : 'var(--txt2)' }} hover={{ borderColor: 'var(--acc)' }}>{amWatching ? '👁 Watching' : 'Watch'}</Hover>}
            {ro && !watchers.length && <span style={{ color: 'var(--txt3)', fontSize: 11.5 }}>None</span>}
          </span>

          <span style={{ color: 'var(--txt3)' }}>Dates</span>
          <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
            <Hover as="span" onClick={(e: any) => openMenu('ds', e)} style={{ fontSize: 11.5, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 7, padding: '3.5px 9px', cursor: ro ? 'default' : 'pointer' }} hover={{ background: ro ? 'transparent' : 'var(--hover)' }}>{t.s != null ? fmt(t.s) : '—'}</Hover>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            <Hover as="span" onClick={(e: any) => openMenu('de', e)} style={{ fontSize: 11.5, fontWeight: 600, border: '1px solid ' + (late ? 'var(--bd)' : 'var(--line)'), color: late ? 'var(--bdT)' : 'var(--txt)', borderRadius: 7, padding: '3.5px 9px', cursor: ro ? 'default' : 'pointer' }} hover={{ background: ro ? 'transparent' : 'var(--hover)' }}>{t.e != null ? fmt(t.e) : '—'}</Hover>
            {late && <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--bdT)', background: 'var(--bdB)', borderRadius: 99, padding: '2px 7px' }}>{TODAY - (t.e ?? 0)}d late</span>}
          </span>

          <span style={{ color: 'var(--txt3)' }}>Priority</span>
          <Hover as="span" onClick={(e: any) => openMenu('pr', e)} style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 6, cursor: ro ? 'default' : 'pointer', padding: '3px 9px', borderRadius: 99, border: '1px solid var(--line)' }} hover={{ background: ro ? 'transparent' : 'var(--hover)' }}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill={pr.c} stroke={pr.c} strokeWidth="2" strokeLinecap="round"><path d="M4 21V4" /><path d="M4 4h12l-2.5 4L16 12H4" stroke="none" /></svg>
            <span style={{ fontWeight: 600, fontSize: 11.5 }}>{pr.t}</span>
          </Hover>

          <span style={{ color: 'var(--txt3)' }}>Repeat</span>
          <select disabled={ro} value={t.recurrence || ''} onChange={(e) => s.updateTask(t.id, { recurrence: e.target.value || null })} style={{ ...selectStyle, justifySelf: 'start' }}>
            {RECUR.map((r) => <option key={r.v} value={r.v}>{r.l}</option>)}
          </select>

          <span style={{ color: 'var(--txt3)', alignSelf: 'start', paddingTop: 4 }}>Labels</span>
          <span style={{ justifySelf: 'start', display: 'inline-flex', alignItems: 'center', gap: 5, flexWrap: 'wrap' }}>
            {(t.lbl || []).map((n, i) => (<span key={i} style={{ fontSize: 10.5, fontWeight: 600, background: 'var(--accS)', color: 'var(--accT)', borderRadius: 99, padding: '3px 9px' }}>{n}</span>))}
            {!ro && <Hover as="span" onClick={() => s.updateTask(t.id, { lbl: [...(t.lbl || []), 'Label ' + ((t.lbl || []).length + 1)] })} style={{ fontSize: 10.5, color: 'var(--txt3)', border: '1px dashed var(--txt3)', borderRadius: 99, padding: '2.5px 8px', cursor: 'pointer' }} hover={{ color: 'var(--accT)', borderColor: 'var(--accT)' }}>+ Add</Hover>}
          </span>

          <span style={{ color: 'var(--txt3)' }}>Estimate</span><span style={{ fontWeight: 600, fontSize: 12 }}>{t.est || '—'}</span>
          <span style={{ color: 'var(--txt3)' }}>Time tracked</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontWeight: 600, fontSize: 12 }}>{totalTxt}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--accT)" strokeWidth="2"><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg></span>
        </div>

        <div style={{ ...SECTION, marginBottom: 6 }}>Description</div>
        <RichText value={t.descr || ''} readOnly={ro} onCommit={(html) => { if (html !== (t.descr || '')) s.updateTask(t.id, { descr: html }); }} />

        {/* Checklist */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 7px' }}>
          <span style={SECTION}>Checklist · {chkDone}/{checklist.length}</span>
        </div>
        {checklist.map((c) => (
          <Hover key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 4px', borderRadius: 8 }} hover={{ background: 'var(--hover)' }}>
            <span onClick={() => !ro && setChecklist(checklist.map((x) => (x.id === c.id ? { ...x, done: !x.done } : x)))} style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px solid ' + (c.done ? 'var(--ok)' : 'var(--txt3)'), background: c.done ? 'var(--ok)' : 'transparent', display: 'grid', placeItems: 'center', cursor: ro ? 'default' : 'pointer', flex: 'none' }}>
              {c.done && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span style={{ flex: 1, fontSize: 12.5, color: c.done ? 'var(--txt3)' : 'var(--txt)', textDecoration: c.done ? 'line-through' : 'none' }}>{c.txt}</span>
            {!ro && <span onClick={() => setChecklist(checklist.filter((x) => x.id !== c.id))} style={{ cursor: 'pointer', color: 'var(--txt3)', fontSize: 13, fontWeight: 700, flex: 'none' }}>×</span>}
          </Hover>
        ))}
        {!ro && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
            <span style={{ width: 16, height: 16, borderRadius: 5, border: '1.5px dashed var(--txt3)', flex: 'none' }} />
            <input value={chkDraft} onChange={(e) => setChkDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' && chkDraft.trim()) { setChecklist([...checklist, { id: newId('ck'), txt: chkDraft.trim(), done: false }]); setChkDraft(''); } }} placeholder="Add checklist item — Enter to save" style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 12.5, color: 'var(--txt)', padding: '5px 0' }} />
          </div>
        )}

        {/* Subtasks */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 7px' }}>
          <span style={SECTION}>Subtasks · {doneN}/{subs.length}</span>
          <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{subPct}%</span>
        </div>
        <div style={{ height: 5, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginBottom: 8 }}><div style={{ width: subPct + '%', height: '100%', background: 'var(--ok)', borderRadius: 99, transition: 'width .25s' }} /></div>
        {subs.map((u) => (
          <Hover key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 4px', borderRadius: 8 }} hover={{ background: 'var(--hover)' }}>
            <span onClick={() => !ro && s.updateTask(u.id, { st: u.st === 'done' ? 'mut' : 'done', pg: u.st === 'done' ? 0 : 100 })} style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid ' + (u.st === 'done' ? 'var(--ok)' : 'var(--txt3)'), background: u.st === 'done' ? 'var(--ok)' : 'transparent', display: 'grid', placeItems: 'center', cursor: ro ? 'default' : 'pointer', flex: 'none' }}>
              {u.st === 'done' && <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>}
            </span>
            <span onClick={() => s.openTask(u.id)} style={{ flex: 1, fontSize: 12.5, cursor: 'pointer', color: u.st === 'done' ? 'var(--txt3)' : 'var(--txt)', textDecoration: u.st === 'done' ? 'line-through' : 'none' }}>{u.name}</span>
            {u.a && memAvatar(u.a, 18)}
            <span style={{ fontSize: 10.5, color: 'var(--txt3)', flex: 'none' }}>{u.e != null ? fmt(u.e) : ''}</span>
          </Hover>
        ))}
        {!ro && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 4px' }}>
            <span style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px dashed var(--txt3)', flex: 'none' }} />
            <input value={s.soSubDraft} onChange={(e) => s.set({ soSubDraft: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && s.soSubDraft.trim()) { s.addTask(s.soSubDraft.trim(), t.pid, t.id); s.set({ soSubDraft: '' }); } }} placeholder="Add subtask — Enter to save" style={{ flex: 1, background: 'transparent', border: 'none', fontSize: 12.5, color: 'var(--txt)', padding: '5px 0' }} />
          </div>
        )}

        {/* Dependencies */}
        <div style={{ ...SECTION, margin: '16px 0 7px' }}>Dependencies</div>
        <div style={{ display: 'grid', gridTemplateColumns: '78px 1fr', gap: '6px 10px', fontSize: 12, alignItems: 'start' }}>
          <span style={{ color: 'var(--txt3)', paddingTop: 4 }}>Blocked by</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {blockedBy.map(({ d, task }) => depChip(t.id, task, d, d.t, 'bb' + task.id))}
            {!blockedBy.length && <span style={{ color: 'var(--txt3)', fontSize: 11.5, paddingTop: 4 }}>None — drag a bar's dot to link</span>}
          </span>
          <span style={{ color: 'var(--txt3)', paddingTop: 4 }}>Blocking</span>
          <span style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
            {blocking.map(({ task, d }) => depChip(task.id, task, d, t.id, 'bl' + task.id))}
            {!blocking.length && <span style={{ color: 'var(--txt3)', fontSize: 11.5, paddingTop: 4 }}>None</span>}
          </span>
        </div>
        {editing && !ro && (
          <div onMouseDown={stop} style={{ marginTop: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 10, background: 'var(--card)' }}>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 7 }}>Dependency on <b>{editing.targetTask.name}</b></div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {DEP_TYPES.map((tp) => { const on = (editing!.dep.type || 'FS') === tp; return (
                <span key={tp} onClick={() => updateDep(editing!.owner.id, editing!.dep.t, { type: tp })} title={tp} style={{ fontSize: 10.5, fontWeight: 800, borderRadius: 7, padding: '4px 9px', cursor: 'pointer', border: '1px solid ' + (on ? 'var(--acc)' : 'var(--line)'), background: on ? 'var(--acc)' : 'transparent', color: on ? '#fff' : 'var(--txt2)' }}>{tp}</span>
              ); })}
              <span style={{ fontSize: 11, color: 'var(--txt3)', marginLeft: 4 }}>Lag</span>
              <input type="number" value={editing.dep.lag ?? 0} onChange={(e) => updateDep(editing!.owner.id, editing!.dep.t, { lag: parseInt(e.target.value || '0', 10) || 0 })} style={{ width: 58, fontSize: 11.5, border: '1px solid var(--line)', borderRadius: 7, padding: '4px 7px', background: 'var(--inputBg)', color: 'var(--txt)' }} />
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>days</span>
            </div>
            <div style={{ display: 'flex', gap: 12, marginTop: 9, fontSize: 11, fontWeight: 600 }}>
              <span onClick={() => s.openTask(editing!.targetTask.id)} style={{ color: 'var(--accT)', cursor: 'pointer' }}>Open task →</span>
              <span onClick={() => removeDep(editing!.owner.id, editing!.dep.t)} style={{ color: 'var(--bdT)', cursor: 'pointer' }}>Remove</span>
              <span onClick={() => setDepEdit(null)} style={{ color: 'var(--txt3)', cursor: 'pointer', marginLeft: 'auto' }}>Done</span>
            </div>
          </div>
        )}

        {/* Custom fields */}
        {cfs.length > 0 && <>
          <div style={{ ...SECTION, margin: '16px 0 7px' }}>Custom fields</div>
          <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr', gap: '7px 10px', alignItems: 'center', fontSize: 12.5 }}>
            {cfs.map((f) => <span key={f.id} style={{ display: 'contents' }}>{cfRow(f)}</span>)}
          </div>
        </>}

        {/* Time tracking */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', margin: '16px 0 7px' }}>
          <span style={SECTION}>Time tracking</span>
          <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>Total {totalTxt}</span>
        </div>
        {!ro && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 8 }}>
            <input type="number" value={timeMin} onChange={(e) => setTimeMin(e.target.value)} placeholder="min" style={{ width: 62, fontSize: 12, border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', background: 'var(--inputBg)', color: 'var(--txt)' }} />
            <input value={timeNote} onChange={(e) => setTimeNote(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') logTime(); }} placeholder="Note (optional)" style={{ flex: 1, fontSize: 12, border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', background: 'var(--inputBg)', color: 'var(--txt)' }} />
            <span onClick={logTime} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 7, padding: '6px 12px', cursor: 'pointer', flex: 'none' }}>Log</span>
          </div>
        )}
        {timeEntries.map((e) => (
          <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 4px', fontSize: 11.5 }}>
            {memAvatar(e.user || myId, 18)}
            <span style={{ fontWeight: 700, color: 'var(--txt)' }}>{minTxt(e.minutes)}</span>
            <span style={{ flex: 1, color: 'var(--txt2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note}</span>
            <span style={{ color: 'var(--txt3)', flex: 'none' }}>{e.day != null ? fmt(e.day) : ''}</span>
          </div>
        ))}
        {!timeEntries.length && <div style={{ fontSize: 11, color: 'var(--txt3)', padding: '2px 4px' }}>No time logged yet</div>}

        {/* Attachments */}
        <div style={{ ...SECTION, margin: '16px 0 7px' }}>Attachments</div>
        {!ro && <>
          <input ref={fileInput} type="file" multiple style={{ display: 'none' }} onChange={(e) => { Array.from(e.target.files || []).forEach((f) => upload(f)); e.target.value = ''; }} />
          <Hover onClick={() => fileInput.current?.click()} onDrop={onDrop} onDragOver={(e: React.DragEvent) => e.preventDefault()} style={{ border: '1.5px dashed var(--line)', borderRadius: 10, padding: 10, textAlign: 'center', fontSize: 11.5, color: 'var(--txt3)', marginBottom: 8, cursor: 'pointer' }} hover={{ borderColor: 'var(--acc)', color: 'var(--accT)', background: 'var(--accS)' }}>Drop files here or <b style={{ color: 'var(--accT)' }}>browse</b></Hover>
          <div style={{ display: 'flex', gap: 6, marginBottom: 8 }}>
            <input value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} placeholder="Paste a link (https://…)" style={{ flex: 1, fontSize: 11.5, border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', background: 'var(--inputBg)', color: 'var(--txt)' }} />
            <input value={linkName} onChange={(e) => setLinkName(e.target.value)} placeholder="Label" style={{ width: 90, fontSize: 11.5, border: '1px solid var(--line)', borderRadius: 7, padding: '5px 8px', background: 'var(--inputBg)', color: 'var(--txt)' }} />
            <span onClick={attachLink} style={{ fontSize: 11, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 7, padding: '6px 11px', cursor: 'pointer', flex: 'none' }}>Attach</span>
          </div>
        </>}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {files.map((f: any, i: number) => {
            const meta = fileMeta[f.k] || fileMeta.file;
            const thumb = thumbs[f.id];
            return (
              <div key={f.id || i} style={{ width: 104, border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden', position: 'relative' }}>
                <Hover onClick={() => openFile(f)} style={{ cursor: 'pointer' }} hover={{ boxShadow: 'var(--sh2)' }}>
                  <div style={{ height: 56, background: thumb ? '#000' : meta.bg, display: 'grid', placeItems: 'center', color: meta.co, fontSize: 10, fontWeight: 800, overflow: 'hidden' }}>
                    {thumb ? <img src={thumb} alt={f.n} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : meta.badge}
                  </div>
                  <div style={{ padding: '5px 7px' }}><div style={{ fontSize: 10, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.n}</div><div style={{ fontSize: 9, color: 'var(--txt3)' }}>{f.s}</div></div>
                </Hover>
                {!ro && f.id && <span onClick={() => removeFile(f)} title="Delete" style={{ position: 'absolute', top: 3, right: 3, width: 17, height: 17, borderRadius: '50%', background: 'rgba(0,0,0,.55)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>×</span>}
              </div>
            );
          })}
          {!files.length && <span style={{ fontSize: 11, color: 'var(--txt3)' }}>No attachments</span>}
        </div>

        {/* Comments / Activity */}
        <div style={{ display: 'flex', gap: 2, borderBottom: '1px solid var(--line)', margin: '18px 0 10px' }}>
          <span onClick={() => s.set({ soTab: 'com' })} style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', cursor: 'pointer', color: s.soTab === 'com' ? 'var(--accT)' : 'var(--txt3)', borderBottom: '2px solid ' + (s.soTab === 'com' ? 'var(--acc)' : 'transparent'), marginBottom: -1 }}>Comments · {coms.length}</span>
          <span onClick={() => s.set({ soTab: 'act' })} style={{ fontSize: 12, fontWeight: 600, padding: '7px 12px', cursor: 'pointer', color: s.soTab === 'act' ? 'var(--accT)' : 'var(--txt3)', borderBottom: '2px solid ' + (s.soTab === 'act' ? 'var(--acc)' : 'transparent'), marginBottom: -1 }}>Activity log</span>
        </div>
        {s.soTab === 'com' && <>
          {roots.map((c) => (<div key={c.id}>{commentBlock(c, false)}{kidsOf(c.id).map((r) => commentBlock(r, true))}</div>))}
          {!coms.length && <div style={{ fontSize: 11.5, color: 'var(--txt3)', padding: '6px 0 10px' }}>No comments yet</div>}
          {!ro && (
            <div style={{ display: 'flex', gap: 9, marginTop: 4 }}>
              <span style={{ width: 26, height: 26, borderRadius: '50%', background: s.user?.color || '#6366F1', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flex: 'none' }}>{myId}</span>
              <div style={{ flex: 1, border: '1px solid var(--line)', borderRadius: 12, background: 'var(--card)', overflow: 'hidden', boxShadow: 'var(--sh1)' }}>
                <textarea value={s.soComDraft} onChange={(e) => s.set({ soComDraft: e.target.value })} placeholder="Write a comment… @ to mention" style={{ width: '100%', minHeight: 52, border: 'none', background: 'transparent', padding: '9px 11px', fontSize: 12.5, color: 'var(--txt)', resize: 'none', display: 'block' }} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderTop: '1px solid var(--line2)' }}>
                  <span onClick={polishDraft} title="Polish writing with AI" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, fontWeight: 600, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 7, padding: '4px 9px', cursor: 'pointer' }}>
                    {s.soPolishBusy
                      ? <svg style={{ animation: 'vspin .7s linear infinite' }} width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M21 12a9 9 0 1 1-6.2-8.56" /></svg>
                      : <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>}
                    Polish</span>
                  <span style={{ flex: 1 }} />
                  <span onClick={() => { postComment(s.soComDraft, null); s.set({ soComDraft: '' }); }} style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 7, padding: '5px 13px', cursor: 'pointer' }}>Send</span>
                </div>
              </div>
            </div>
          )}
        </>}
        {s.soTab === 'act' && <>
          {acts.map((a, i) => (
            <div key={i} style={{ display: 'flex', gap: 9, padding: '5px 0', alignItems: 'flex-start' }}>
              <span style={{ width: 22, height: 22, borderRadius: '50%', background: 'var(--muB)', color: 'var(--muT)', display: 'grid', placeItems: 'center', fontSize: 9, fontWeight: 800, flex: 'none' }}>{a.ic}</span>
              <div style={{ flex: 1, fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.45 }}>{a.txt}</div>
            </div>
          ))}
        </>}
      </div>
      <div style={{ flex: 'none', padding: '10px 16px', borderTop: '1px solid var(--line)', background: 'var(--panel)' }}>
        <Hover as="span" onClick={askAiAboutTask} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, fontSize: 12, fontWeight: 600, color: 'var(--accT)', background: 'var(--accS)', border: '1px solid var(--acc2)', borderRadius: 10, padding: 8, cursor: 'pointer', transition: 'transform .15s' }} hover={{ transform: 'translateY(-1px)' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>Ask AI about this task</Hover>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 90, display: 'grid', placeItems: 'center', padding: 30 }}>
          <div onMouseDown={stop} onClick={stop} style={{ maxWidth: '92%', maxHeight: '90%', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <img src={lightbox.url} alt={lightbox.name} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain', borderRadius: 10, boxShadow: 'var(--sh3)' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, color: '#fff', fontSize: 12 }}><span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lightbox.name}</span><span onClick={() => setLightbox(null)} style={{ cursor: 'pointer', fontWeight: 700 }}>Close ✕</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
