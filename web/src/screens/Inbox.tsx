import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { notifVM } from '../lib/notif';
import type { View } from '../types';

const seg = (on: boolean) => ({ bg: on ? 'var(--card)' : 'transparent', co: on ? 'var(--txt)' : 'var(--txt2)', fw: on ? 700 : 500, sh: on ? 'var(--sh1)' : 'none' } as const);

export function Inbox() {
  const s = useStore();
  const list = s.inbox.filter((n) => s.inboxTab === 'all' || (s.inboxTab === 'men' && n.kind === 'mention') || (s.inboxTab === 'ai' && n.kind === 'ai'));

  const tab = (label: string, key: string, on: boolean) => {
    const g = seg(on);
    return (
      <span
        onClick={() => s.set({ inboxTab: key })}
        style={{ fontSize: 11.5, fontWeight: g.fw, padding: '4.5px 12px', borderRadius: 7, background: g.bg, color: g.co, cursor: 'pointer', boxShadow: g.sh }}
      >
        {label}
      </span>
    );
  };

  return (
    <div data-screen-label="Inbox" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ maxWidth: 760, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>Inbox</span>
          <div style={{ display: 'flex', background: 'var(--muB)', borderRadius: 9, padding: 2 }}>
            {tab('All', 'all', s.inboxTab === 'all')}
            {tab('Mentions', 'men', s.inboxTab === 'men')}
            {tab('AI', 'ai', s.inboxTab === 'ai')}
          </div>
          <span onClick={() => s.markAllRead()} style={{ marginLeft: 'auto', fontSize: 11.5, fontWeight: 600, color: 'var(--accT)', cursor: 'pointer' }}>Mark all read</span>
        </div>
        {list.map((n) => {
          const vm = notifVM(n);
          const isAi = n.kind === 'ai';
          const hasRef = !!n.ref && !!s.task(n.ref);
          return (
            <Hover
              key={n.id}
              onClick={() => {
                s.markRead(n.id);
                if (n.ref) {
                  if (s.task(n.ref)) s.openTask(n.ref);
                  else s.pushToast('Task no longer exists', 'bad');
                } else if (n.go) s.setView(n.go as View);
              }}
              style={{ display: 'flex', gap: 11, background: 'var(--card)', border: `1px solid ${n.unread ? 'var(--acc2)' : 'var(--line)'}`, borderRadius: 13, padding: '12px 14px', marginBottom: 7, cursor: 'pointer', boxShadow: 'var(--sh1)' }}
              hover={{ borderColor: 'var(--acc)' }}
            >
              <span style={{ width: 30, height: 30, borderRadius: 9, background: vm.icBg, color: vm.icCo, display: 'grid', placeItems: 'center', flex: 'none', fontSize: 12, fontWeight: 800 }}>{n.ic}</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, lineHeight: 1.45, color: 'var(--txt)' }}>{n.txt}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--txt3)' }}>{n.when}</span>
                  {isAi && <span style={{ fontSize: 9, fontWeight: 800, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '1.5px 7px' }}>✦ VELOX AI</span>}
                  {hasRef && <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--accT)' }}>Open task →</span>}
                </div>
              </div>
              {n.unread && <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--acc)', flex: 'none', marginTop: 5 }} />}
            </Hover>
          );
        })}
        {list.length === 0 && (
          <div style={{ textAlign: 'center', padding: '44px 0' }}>
            <div style={{ width: 52, height: 52, borderRadius: 16, background: 'var(--okB)', display: 'grid', placeItems: 'center', margin: '0 auto 12px' }}>
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--okT)" strokeWidth="2.5" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>
            </div>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>All caught up</div>
            <div style={{ fontSize: 12, color: 'var(--txt3)' }}>New mentions, assignments and AI alerts land here.</div>
          </div>
        )}
      </div>
    </div>
  );
}
