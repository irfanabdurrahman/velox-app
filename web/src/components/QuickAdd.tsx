import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store';
import { TODAY } from '../lib/dates';
import { parseNL, nlFromServer, inboxProjOf, INBOX_SENTINEL, NLChips, type NL } from '../screens/AiPage';
import { api } from '../api';

export function QuickAdd() {
  const s = useStore();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const [projOv, setProjOv] = useState<string | null>(null);
  // Local overrides for the editable parsed chips (undefined = use the parsed value).
  const [aOv, setAOv] = useState<string | null | undefined>(undefined);
  const [dueOv, setDueOv] = useState<number | null | undefined>(undefined);
  const [prOv, setPrOv] = useState<string | undefined>(undefined);
  // server-grounded parse result (when s.aiEnabled), keyed to the text it parsed
  const [srv, setSrv] = useState<{ nl: NL; forText: string } | null>(null);

  useEffect(() => { if (s.quickAdd) setTimeout(() => taRef.current?.focus(), 30); }, [s.quickAdd]);

  // Debounced /ai/parse-task preview; falls back to the local parser on error.
  useEffect(() => {
    if (!s.quickAdd || !s.aiEnabled) return;
    const text = s.qaText;
    if (!text.trim() || text.trim().length <= 8) { setSrv(null); return; }
    const h = setTimeout(() => {
      api.aiParse(text)
        .then((r: any) => setSrv({ nl: nlFromServer(r, text), forText: text }))
        .catch(() => setSrv(null));
    }, 600);
    return () => clearTimeout(h);
  }, [s.qaText, s.aiEnabled, s.quickAdd]);

  if (!s.quickAdd) return null;

  const aiUsed = !!(srv && srv.forText === s.qaText);
  const qa = aiUsed ? srv!.nl : parseNL(s.qaText, s);
  const qaPrevOn = !!(qa && qa.title && s.qaText.trim().length > 8);
  // Target project: an explicit chip pick wins, then a project named in the text,
  // else the "Belum diatur" inbox (null until it's lazily created on submit).
  const inbox = inboxProjOf(s, s.ws) || null;
  const qaProjEff = projOv === INBOX_SENTINEL ? inbox : projOv ? s.proj(projOv) || null : (qa && qa.proj) || inbox;

  // Effective (edited) values — overrides win over the parsed values; tasks
  // default to the creator so they always land in their My Tasks.
  const effA = aOv !== undefined ? aOv : (qa?.assignee ?? s.user?.id ?? null);
  const effDue = dueOv !== undefined ? dueOv : (qa?.due ?? null);
  const effPr = prOv !== undefined ? prOv : (qa?.pr ?? 'med');

  const role = s.myRoles[s.ws];
  const noWritable = !role || role === 'GUEST' || role === 'EXEC_VIEWER';

  const resetOv = () => { setProjOv(null); setAOv(undefined); setDueOv(undefined); setPrOv(undefined); setSrv(null); };
  const close = () => { s.set({ quickAdd: false, qaText: '' }); resetOv(); };

  const resolveTarget = async () => {
    if (qaProjEff) return qaProjEff;
    try { return await s.ensureInbox(s.ws); }
    catch { s.pushToast('Gagal menyiapkan "Belum diatur"', 'bad'); return null; }
  };
  const doneToast = (id: string, name: string) => {
    s.pushToast('Task dibuat di ' + name, 'ok', { label: 'Buka', go: () => useStore.getState().openTask(id) });
  };

  const create = async () => {
    if (!qa || noWritable) return;
    const target = await resolveTarget();
    if (!target) return;
    const id = s.addTask(qa.title, target.id, null, effDue ?? undefined, { a: effA ?? null, pr: effPr || 'med' });
    close();
    doneToast(id, target.name);
  };
  const createOpen = async () => {
    if (!qa || noWritable) return;
    const target = await resolveTarget();
    if (!target) return;
    const id = s.addTask(qa.title, target.id, null, effDue ?? undefined, { a: effA ?? null, pr: effPr || 'med' });
    s.set({ quickAdd: false, qaText: '', screen: 'project', projectId: target.id });
    resetOv();
    s.openTask(id);
  };
  // Short inputs: create the raw text as a simple task due today, assigned to me.
  const createSimple = async () => {
    const txt = s.qaText.trim();
    if (!txt || noWritable) return;
    const target = await resolveTarget();
    if (!target) return;
    const id = s.addTask(txt, target.id, null, TODAY, { a: s.user?.id ?? null });
    close();
    doneToast(id, target.name);
  };
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      if (qaPrevOn) create();
      else createSimple();
    }
  };

  const simpleTargetName = qaProjEff ? qaProjEff.name : '📥 Belum diatur';
  const disBtn = { color: '#fff', background: 'var(--muB)', cursor: 'not-allowed' } as const;

  return (
    <div onMouseDown={close} style={{ position: 'fixed', inset: 0, zIndex: 85 }}>
      <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 56, right: s.mobile ? 10 : 'clamp(12px,calc(100vw - 520px),170px)', left: s.mobile ? 10 : undefined, width: s.mobile ? 'auto' : 'min(480px,90vw)', background: 'var(--glass)', backdropFilter: 'blur(18px)', border: '1px solid var(--line)', borderRadius: 16, boxShadow: 'var(--sh3)', padding: 14, animation: 'vpop .16s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 9 }}>
          <span style={{ fontSize: 12.5, fontWeight: 700 }}>Quick add task</span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 9.5, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '2px 8px' }}><svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg>{s.aiEnabled ? 'AI parses EN / ID' : 'Parses EN / ID'}</span>
        </div>
        <textarea ref={taRef} value={s.qaText} onChange={(e) => s.set({ qaText: e.target.value })} onKeyDown={onKey} placeholder="Ketik apa saja — task langsung tersimpan ke 📥 Belum diatur" style={{ width: '100%', minHeight: 58, resize: 'none', background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px', fontSize: 12.5, color: 'var(--txt)', lineHeight: 1.5 }} />
        {qaPrevOn && qa && (
          <div style={{ marginTop: 10, border: '1px solid var(--acc2)', background: 'var(--accS)', borderRadius: 12, padding: 11, animation: 'vup .18s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--accT)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg><span style={{ fontSize: 10.5, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Parsed preview</span>{aiUsed && <span title="Parsed by the server AI" style={{ fontSize: 9, fontWeight: 800, background: 'var(--accT)', color: '#fff', borderRadius: 99, padding: '1.5px 7px' }}>AI</span>}{qa.isID && <span style={{ fontSize: 9, fontWeight: 700, background: 'var(--card)', color: 'var(--txt2)', border: '1px solid var(--line)', borderRadius: 99, padding: '1.5px 7px' }}>🇮🇩 Bahasa Indonesia</span>}</div>
            <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--txt)', marginBottom: 8 }}>{qa.title}</div>
            <NLChips ws={s.ws} assignee={effA} due={effDue} pr={effPr} projId={qaProjEff?.id ?? null} onAssignee={setAOv} onDue={setDueOv} onPr={setPrOv} onProj={(id) => setProjOv(id)} />
            <div style={{ display: 'flex', gap: 7, marginTop: 11, alignItems: 'center' }}>
              <span onClick={noWritable ? undefined : create} style={{ fontSize: 11.5, fontWeight: 700, borderRadius: 8, padding: '6px 14px', boxShadow: '0 1px 3px var(--ring)', ...(noWritable ? disBtn : { color: '#fff', background: 'var(--acc)', cursor: 'pointer' }) }}>Create task</span>
              <span onClick={noWritable ? undefined : createOpen} style={{ fontSize: 11.5, fontWeight: 600, color: noWritable ? 'var(--txt3)' : 'var(--txt2)', border: '1px solid var(--line)', borderRadius: 8, padding: '6px 12px', cursor: noWritable ? 'not-allowed' : 'pointer', background: 'var(--card)' }}>Buat & buka</span>
            </div>
          </div>
        )}
        {!qaPrevOn && s.qaText.trim() && !noWritable && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 9 }}>
            <span onClick={createSimple} style={{ fontSize: 11.5, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '6px 14px', cursor: 'pointer', boxShadow: '0 1px 3px var(--ring)' }}>Create as task</span>
            <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>due today · {simpleTargetName} · or press Ctrl/⌘+Enter</span>
          </div>
        )}
        {noWritable && (
          <div style={{ marginTop: 9, fontSize: 11, color: 'var(--txt2)', border: '1px dashed var(--line)', borderRadius: 10, padding: '8px 11px' }}>
            Kamu hanya punya akses lihat di workspace ini — minta akses member untuk menambah task.
          </div>
        )}
        {!noWritable && (
          <div style={{ marginTop: 8, fontSize: 10.5, color: 'var(--txt3)', lineHeight: 1.55 }}>
            Contoh: <span onClick={() => s.set({ qaText: "Buat tugas 'Kalibrasi mesin CNC', tugaskan ke Dewi, tenggat Jumat, prioritas tinggi" })} style={{ color: 'var(--accT)', cursor: 'pointer', fontWeight: 600 }}>"Buat tugas 'Kalibrasi mesin CNC', tugaskan ke Dewi, tenggat Jumat, prioritas tinggi"</span> · sebut <b>project …</b> untuk memilih project, tanpa itu task masuk ke 📥 Belum diatur
          </div>
        )}
      </div>
    </div>
  );
}
