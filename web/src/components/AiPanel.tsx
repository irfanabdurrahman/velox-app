import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { prMeta } from '../lib/meta';
import { Hover } from './Hover';
import { aiReplyFor, aiCreateFromNL, aiErrText, nlFromServer, parseNL, fallbackProject, isRiskIntent, RiskCard, type NL } from '../screens/AiPage';
import { api } from '../api';

const isCreateIntent = (txt: string) => {
  const t = txt.toLowerCase();
  return /\b(create|buat)\b/.test(t) && (t.includes('task') || t.includes('tugas'));
};

// aiSend (line 3162) for the panel surface
function pSend(raw: string) {
  const txt = raw.trim(); if (!txt) return;
  const s = useStore.getState();
  s.set((st) => ({ pMsgs: [...st.pMsgs, { k: 'user', txt }], pInput: '', pBusy: true }));
  const done = (msg: any) => useStore.getState().set((x) => ({ pMsgs: [...x.pMsgs, msg], pBusy: false }));
  // NL task-create keeps the parse-and-preview flow.
  if (isCreateIntent(txt)) {
    if (s.aiEnabled) {
      api.aiParse(txt)
        .then((r: any) => done({ k: 'nl', nl: nlFromServer(r, txt), raw: txt }))
        .catch((e: any) => {
          const nl = parseNL(txt, useStore.getState());
          if (nl && nl.title) done({ k: 'nl', nl, raw: txt });
          else done({ k: 'txt', txt: aiErrText(e) });
        });
    } else {
      const nl = parseNL(txt, s);
      setTimeout(() => done(nl && nl.title ? { k: 'nl', nl, raw: txt } : aiReplyFor(txt, useStore.getState())), 650);
    }
    return;
  }
  // Risk/delay intent always renders the structured risk card (real data via api.aiRisk).
  if (isRiskIntent(txt)) { done({ k: 'risk' }); return; }
  // Demo mode: scripted cards. Real mode: every other intent goes to /ai/chat.
  if (!s.aiEnabled) {
    const scripted = aiReplyFor(txt, s);
    setTimeout(() => done(scripted), 650);
    return;
  }
  const history = useStore.getState().pMsgs
    .map((m: any) => (m.k === 'user' ? { role: 'user', content: m.txt } : ((m.k === 'txt' || m.k === 'assistant') && m.txt ? { role: 'assistant', content: m.txt } : null)))
    .filter(Boolean) as { role: string; content: string }[];
  api.aiChat(history)
    .then((r: any) => done({ k: 'txt', txt: r.text }))
    .catch((e: any) => done({ k: 'txt', txt: aiErrText(e) }));
}

const SUM_TXT = 'Karawang Relocation is 34% complete and AT RISK. Critical chain: Land clearing → PLN rerouting → disassembly → transport → reassembly → Production restart (Aug 28). Biggest threat: IMB permit at 35% with 6 working days of float. 1 task overdue (Soil compaction test). Recommend fast-tracking the permit and locking the rigging vendor this week.';

export function AiPanel() {
  const s = useStore();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [s.pMsgs, s.pBusy]);

  if (!s.aiPanel) return null;

  const ctxMap: Record<string, any> = { project: { gantt: 'Gantt · ', list: 'List · ', board: 'Board · ', cal: 'Calendar · ', wl: 'Workload · ', pdash: 'Dashboard · ' }, home: 'Executive Dashboard', mytasks: 'My Tasks', inbox: 'Inbox', ai: 'AI page', chat: 'Chat', goals: 'Goals', settings: 'Settings', admin: 'Admin' };
  const aiCtx = s.screen === 'project' ? (ctxMap.project[s.view] || '') + (s.proj(s.projectId)?.name || '') : (ctxMap[s.screen] || 'Workspace');
  const aiPanelRight = s.soId ? Math.min(520, window.innerWidth * 0.92) : 0;

  const chips = s.screen === 'project'
    ? [
      { t: 'Summarize this view', q: 'Summarize this view' },
      { t: 'Find scheduling conflicts', q: 'Find scheduling conflicts' },
      { t: 'Buat tugas ‘Safety briefing’, tugaskan ke Intan, tenggat Senin', q: 'Buat tugas ‘Safety briefing’, tugaskan ke Intan, tenggat Senin' },
    ]
    : [
      { t: 'Summarize what needs my attention', q: 'Summarize this view' },
      { t: 'Which projects are at risk?', q: 'Which projects are at risk of delay?' },
      { t: 'Find scheduling conflicts', q: 'Find scheduling conflicts' },
    ];

  const fixConflicts = () => { s.set({ aiPanel: false, screen: 'project', view: 'gantt' }); s.autoSchedule(); };

  const renderMsg = (m: any, i: number) => {
    // Canned demo cards belong to demo mode only.
    if (s.aiEnabled && (m.k === 'sum' || m.k === 'conflict')) return null;
    if (m.k === 'user') return (
      <div key={i} style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 9 }}><div style={{ maxWidth: '85%', background: 'var(--acc)', color: '#fff', borderRadius: '13px 13px 4px 13px', padding: '8px 12px', fontSize: 12, lineHeight: 1.5 }}>{m.txt}</div></div>
    );
    if (m.k === 'txt') return (
      <div key={i} style={{ display: 'flex', marginBottom: 9 }}><div style={{ maxWidth: '92%', background: 'var(--hover)', borderRadius: '13px 13px 13px 4px', padding: '8px 12px', fontSize: 12, lineHeight: 1.55 }}>{m.txt}</div></div>
    );
    if (m.k === 'risk') return <RiskCard key={i} compact />;
    if (m.k === 'sum') return (
      <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 11, marginBottom: 9, background: 'var(--card)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6 }}>✦ View summary</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.6, color: 'var(--txt)' }}>{SUM_TXT}</div>
      </div>
    );
    if (m.k === 'conflict') return (
      <div key={i} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 11, marginBottom: 9, background: 'var(--card)' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--waT)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 7 }}>⚠ 2 scheduling conflicts</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--txt)', marginBottom: 4 }}><b>Permit finalization (IMB)</b> ends Jul 24 but successor <b>Line 3 disassembly</b> needs it by Aug 3 with only 6d buffer at 35% progress.</div>
        <div style={{ fontSize: 11.5, lineHeight: 1.55, color: 'var(--txt)', marginBottom: 9 }}><b>Dewi Putri</b> is booked 52h in week of Aug 17 (reassembly + CQI labeling).</div>
        <span onClick={fixConflicts} style={{ display: 'inline-flex', fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '5.5px 11px', cursor: 'pointer' }}>Fix with Auto-schedule</span>
      </div>
    );
    if (m.k === 'nl' && m.nl) {
      const nl: NL = m.nl;
      const nlA = nl.assignee ? s.members[nl.assignee]?.n : 'Unassigned';
      const nlD = nl.dueTxt || 'No due date';
      const nlP = nl.pr ? prMeta(nl.pr).t : 'Medium';
      const nlPr = nl.proj ? nl.proj.name : (fallbackProject(s)?.name || 'No project yet');
      return (
        <div key={i} style={{ border: '1px solid var(--acc2)', background: 'var(--accS)', borderRadius: 12, padding: 11, marginBottom: 9 }}>
          <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 6 }}>Parsed task preview</div>
          <div style={{ fontSize: 12.5, fontWeight: 700, marginBottom: 7 }}>{nl.title}</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 9 }}>
            <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '2.5px 8px', color: 'var(--txt2)' }}>👤 {nlA}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '2.5px 8px', color: 'var(--txt2)' }}>📅 {nlD}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '2.5px 8px', color: 'var(--txt2)' }}>⚑ {nlP}</span>
            <span style={{ fontSize: 10, fontWeight: 600, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 99, padding: '2.5px 8px', color: 'var(--txt2)' }}>▦ {nlPr}</span>
          </div>
          <span onClick={() => aiCreateFromNL(nl)} style={{ display: 'inline-flex', fontSize: 11, fontWeight: 700, color: '#fff', background: 'var(--acc)', borderRadius: 8, padding: '5.5px 12px', cursor: 'pointer' }}>Create</span>
        </div>
      );
    }
    return null;
  };

  return (
    <div onMouseDown={(e) => e.stopPropagation()} style={{ position: 'fixed', top: 50, right: aiPanelRight, bottom: 0, width: 'min(378px,92vw)', background: 'var(--panel)', borderLeft: '1px solid var(--line)', boxShadow: 'var(--sh3)', zIndex: 35, display: 'flex', flexDirection: 'column', animation: 'vslide .22s cubic-bezier(.2,.8,.3,1)' }}>
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '12px 14px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ width: 26, height: 26, borderRadius: 8, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center', flex: 'none' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.9z" /></svg></span>
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>Velox AI</div><div style={{ fontSize: 10, color: 'var(--txt3)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>Context: {aiCtx}</div></div>
        <Hover as="span" onClick={() => s.go('ai')} title="Open full AI page" style={{ fontSize: 10, fontWeight: 700, color: 'var(--accT)', cursor: 'pointer', border: '1px solid var(--line)', borderRadius: 6, padding: '3px 7px' }} hover={{ background: 'var(--accS)' }}>Full page</Hover>
        <svg onClick={() => s.set({ aiPanel: false })} style={{ cursor: 'pointer', flex: 'none' }} width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" strokeLinecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
      </div>
      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        <div style={{ background: 'var(--accS)', borderRadius: 12, padding: '10px 12px', fontSize: 12, lineHeight: 1.5, color: 'var(--txt)', marginBottom: 10 }}>Hi Budi — I can see <b>{aiCtx}</b>. Ask me about this view, or try:</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {chips.map((c, j) => (
            <Hover key={j} as="span" onClick={() => pSend(c.q)} style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--accT)', border: '1px solid var(--line)', background: 'var(--card)', borderRadius: 10, padding: '7px 11px', cursor: 'pointer' }} hover={{ borderColor: 'var(--acc)', background: 'var(--accS)' }}>{c.t}</Hover>
          ))}
        </div>
        {s.pMsgs.map(renderMsg)}
        {s.pBusy && <div style={{ display: 'flex', gap: 4, padding: '6px 2px', marginBottom: 6 }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--txt3)', animation: 'vpulse 1s infinite' }} /><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--txt3)', animation: 'vpulse 1s .2s infinite' }} /><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--txt3)', animation: 'vpulse 1s .4s infinite' }} /></div>}
      </div>
      <div style={{ flex: 'none', padding: '10px 12px', borderTop: '1px solid var(--line)' }}>
        <div style={{ display: 'flex', gap: 7, alignItems: 'flex-end', background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 12, padding: '7px 8px 7px 12px' }}>
          <textarea value={s.pInput} onChange={(e) => s.set({ pInput: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); pSend(s.pInput); } }} placeholder="Ask about this view…" style={{ flex: 1, background: 'transparent', border: 'none', resize: 'none', fontSize: 12, color: 'var(--txt)', maxHeight: 80, minHeight: 20, lineHeight: 1.5 }} />
          <span onClick={() => pSend(s.pInput)} style={{ width: 28, height: 28, borderRadius: 9, background: 'var(--acc)', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg></span>
        </div>
      </div>
    </div>
  );
}
