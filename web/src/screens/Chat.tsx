import { useState } from 'react';
import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { dotFor } from '../lib/meta';
import { fmt, TODAY } from '../lib/dates';

export function Chat() {
  const s = useStore();
  const [hov, setHov] = useState<number | null>(null);
  const [conv, setConv] = useState<Record<string, boolean>>({});

  const channels = s.chatChannels.filter((c) => c.kind !== 'dm');
  const dms = s.chatChannels.filter((c) => c.kind === 'dm');
  const cur = s.chatChannels.find((c) => c.id === s.chatChan);
  const msgs = s.chatMsgs[s.chatChan] || [];
  const noChans = s.chatChannels.length === 0;

  const chanRow = (c: (typeof s.chatChannels)[number]) => {
    const sel = s.chatChan === c.id;
    return (
      <Hover
        key={c.id}
        onClick={() => s.set({ chatChan: c.id })}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6.5px 9px', borderRadius: 8, cursor: 'pointer', background: sel ? 'var(--accS)' : 'transparent', color: sel ? 'var(--accT)' : 'var(--txt2)', fontWeight: sel ? 700 : 500, fontSize: 12.5 }}
        hover={{ background: 'var(--hover)' }}
      >
        <span style={{ color: 'var(--txt3)', fontWeight: 600 }}>#</span>
        <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
      </Hover>
    );
  };

  const dmRow = (c: (typeof s.chatChannels)[number]) => {
    const sel = s.chatChan === c.id;
    const avId = c.id.replace(/^dm/, '');
    const av = s.members[avId];
    return (
      <Hover
        key={c.id}
        onClick={() => s.set({ chatChan: c.id })}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6.5px 9px', borderRadius: 8, cursor: 'pointer', background: sel ? 'var(--accS)' : 'transparent', color: sel ? 'var(--accT)' : 'var(--txt2)', fontWeight: sel ? 700 : 500, fontSize: 12.5 }}
        hover={{ background: 'var(--hover)' }}
      >
        <span style={{ width: 18, height: 18, borderRadius: '50%', background: av?.c || 'var(--txt3)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 7, fontWeight: 800 }}>{av ? avId : '?'}</span>
        <span style={{ flex: 1 }}>{c.name}</span>
      </Hover>
    );
  };

  const send = () => {
    const txt = s.chatInput.trim();
    if (!txt || noChans || !s.chatChan) return;
    const ref = s.tasks.find((t) => t.name.length > 6 && txt.toLowerCase().includes(t.name.toLowerCase()))?.id || null;
    s.sendChat(s.chatChan, txt, ref);
    s.set({ chatInput: '' });
  };

  return (
    <div data-screen-label="Chat" style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--card)' }}>
      <div style={{ width: 212, flex: 'none', borderRight: '1px solid var(--line)', background: 'var(--panel)', display: 'flex', flexDirection: 'column', overflowY: 'auto', padding: '10px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', padding: '4px 8px' }}>Channels</div>
        {channels.map(chanRow)}
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', padding: '12px 8px 4px' }}>Direct messages</div>
        {dms.map(dmRow)}
      </div>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '11px 16px', borderBottom: '1px solid var(--line)' }}>
          <span style={{ fontSize: 13.5, fontWeight: 800 }}>{noChans ? 'Chat' : `# ${cur?.name || ''}`}</span>
          <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{noChans ? '' : msgs.length + (msgs.length === 1 ? ' message' : ' messages')}</span>
          {!noChans && <span style={{ marginLeft: 'auto', fontSize: 10.5, color: 'var(--txt3)' }}>Hover a message → Convert to task</span>}
        </div>
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '14px 16px' }}>
          {noChans && (
            <div style={{ textAlign: 'center', padding: '52px 0' }}>
              <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 4 }}>No channels yet</div>
              <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Channels for your workspace will appear here.</div>
            </div>
          )}
          {msgs.map((m, i) => {
            const rt = m.ref ? s.task(m.ref) : undefined;
            const who = s.members[m.who];
            const converted = !!conv[`${s.chatChan}:${i}`];
            const showHov = hov === i && !converted;
            const rp = rt ? s.proj(rt.pid) : undefined;
            return (
              <div
                key={i}
                onMouseEnter={() => setHov(i)}
                onMouseLeave={() => setHov((h) => (h === i ? null : h))}
                style={{ display: 'flex', gap: 10, padding: '7px 8px', borderRadius: 10, position: 'relative', background: hov === i ? 'var(--hover)' : 'transparent' }}
              >
                <span style={{ width: 30, height: 30, borderRadius: 9, background: who?.c || 'var(--txt3)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 10, fontWeight: 800, flex: 'none' }}>{who ? m.who : '?'}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'baseline', gap: 7 }}>
                    <span style={{ fontSize: 12.5, fontWeight: 800 }}>{who?.n || m.who}</span>
                    <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{m.when}</span>
                  </div>
                  <div style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--txt)' }}>{m.txt}</div>
                  {rt && (
                    <Hover
                      onClick={() => { s.set({ projectId: rt.pid }); s.openTask(rt.id); }}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, marginTop: 6, border: '1px solid var(--line)', borderRadius: 10, padding: '7px 11px', cursor: 'pointer', background: 'var(--bg)' }}
                      hover={{ borderColor: 'var(--acc)' }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotFor(rt.st) }} />
                      <span>
                        <span style={{ display: 'block', fontSize: 11.5, fontWeight: 700 }}>{rt.name}</span>
                        <span style={{ display: 'block', fontSize: 9.5, color: 'var(--txt3)' }}>{(rp?.name || '') + ' · due ' + fmt(rt.e ?? 0)}</span>
                      </span>
                      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" strokeLinecap="round"><path d="M7 17L17 7M9 7h8v8" /></svg>
                    </Hover>
                  )}
                  {converted && <div style={{ marginTop: 5, fontSize: 10.5, color: 'var(--okT)', fontWeight: 700 }}>✓ Converted to task</div>}
                </div>
                {showHov && (
                  <span
                    onClick={() => { s.addTask(m.txt.slice(0, 60), undefined, null, TODAY); setConv((c) => ({ ...c, [`${s.chatChan}:${i}`]: true })); s.pushToast('Task created from message'); }}
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ position: 'absolute', top: -10, right: 10, display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'var(--accT)', background: 'var(--glass)', backdropFilter: 'blur(10px)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 9px', cursor: 'pointer', boxShadow: 'var(--sh2)' }}
                  >
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
                    Convert to task
                  </span>
                )}
              </div>
            );
          })}
        </div>
        <div style={{ flex: 'none', padding: '10px 16px 14px' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end', background: 'var(--bg)', border: '1.5px solid var(--line)', borderRadius: 13, padding: '8px 9px 8px 13px', opacity: noChans ? 0.55 : 1 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--txt3)" strokeWidth="2" style={{ marginBottom: 4, cursor: noChans ? 'default' : 'pointer' }}><path d="M21.4 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.65 5.66l-9.2 9.19a2 2 0 0 1-2.82-2.83l8.49-8.48" /></svg>
            <textarea
              value={s.chatInput}
              disabled={noChans}
              onChange={(e) => s.set({ chatInput: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={noChans ? 'No channels yet' : `Message #${cur?.name || ''} — paste a task name to unfurl it`}
              style={{ flex: 1, background: 'transparent', border: 'none', resize: 'none', fontSize: 12.5, color: 'var(--txt)', maxHeight: 90, minHeight: 20, lineHeight: 1.5 }}
            />
            <span onClick={noChans ? undefined : send} style={{ width: 29, height: 29, borderRadius: 9, background: noChans ? 'var(--muB)' : 'var(--acc)', display: 'grid', placeItems: 'center', cursor: noChans ? 'default' : 'pointer', flex: 'none' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19V5M5 12l7-7 7 7" /></svg>
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
