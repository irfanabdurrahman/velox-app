import { useState } from 'react';
import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { fmt, TODAY } from '../lib/dates';
import { t, useLang } from '../lib/i18n';
import { INBOX_CODE } from './AiPage';

export function MyTasks() {
  const s = useStore();
  useLang(); // re-render on language switch
  const uid = s.user?.id;
  const [moveFor, setMoveFor] = useState<string | null>(null);
  const mine = s.tasks.filter((t) => t.a === uid && !t.ms && t.s !== null);

  // Quick-add tasks land in the "Belum diatur" inbox project (code INBX) and
  // surface here as a triage group until they're moved to a real project.
  const inboxPids = new Set(s.projects.filter((p) => p.code === INBOX_CODE).map((p) => p.id));
  const inboxTasks = mine.filter((t) => inboxPids.has(t.pid) && t.st !== 'done');
  const sorted = mine.filter((t) => !(inboxPids.has(t.pid) && t.st !== 'done'));

  const grp: { over: typeof mine; today: typeof mine; week: typeof mine; later: typeof mine } = { over: [], today: [], week: [], later: [] };
  sorted.forEach((t) => {
    const e = t.e ?? 0;
    if (t.st !== 'done' && e < TODAY) grp.over.push(t);
    else if (e === TODAY) grp.today.push(t);
    else if (e <= TODAY + 3) grp.week.push(t);
    else grp.later.push(t);
  });

  const groups = [
    { label: '📥 ' + t('mytasks.inbox'), co: 'var(--accT)', bgc: 'var(--accS)', items: inboxTasks, inbox: true },
    { label: t('mytasks.overdue'), co: 'var(--bdT)', bgc: 'var(--bdB)', items: grp.over, inbox: false },
    { label: t('mytasks.today'), co: 'var(--accT)', bgc: 'var(--accS)', items: grp.today, inbox: false },
    { label: t('mytasks.week'), co: 'var(--txt2)', bgc: 'var(--muB)', items: grp.week, inbox: false },
    { label: t('mytasks.later'), co: 'var(--txt3)', bgc: 'var(--muB)', items: grp.later, inbox: false },
  ].filter((g) => g.items.length);

  const wsList = s.workspaces.filter((w) => { const r = s.myRoles[w.id]; return r && r !== 'GUEST' && r !== 'EXEC_VIEWER'; });

  return (
    <div data-screen-label="My Tasks" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{t('nav.mytasks')}</span>
          <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{s.user?.name || ''} · {t('mytasks.sub')}</span>
        </div>
        {mine.length === 0 && (
          <div style={{ background: 'var(--card)', border: '1px dashed var(--line)', borderRadius: 14, padding: '44px 20px', textAlign: 'center', boxShadow: 'var(--sh1)' }}>
            <div style={{ fontSize: 14, fontWeight: 800, marginBottom: 5 }}>{t('empty.mytasks')}</div>
            <div style={{ fontSize: 11.5, color: 'var(--txt2)' }}>{t('empty.mytasks.sub')}</div>
          </div>
        )}
        {groups.map((g) => (
          <div key={g.label}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 7px' }}>
              <span style={{ fontSize: 12, fontWeight: 800, color: g.co }}>{g.label}</span>
              <span style={{ fontSize: 10, fontWeight: 700, background: g.bgc, color: g.co, borderRadius: 99, padding: '1.5px 8px' }}>{g.items.length}</span>
              {g.inbox && <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{t('mytasks.inbox.sub')}</span>}
            </div>
            {g.items.map((t2) => {
              const p = s.proj(t2.pid);
              const done = t2.st === 'done';
              const e = t2.e ?? 0;
              return (
                <div key={t2.id} style={{ marginBottom: 6 }}>
                  <Hover
                    style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '9px 13px', boxShadow: 'var(--sh1)' }}
                    hover={{ borderColor: 'var(--acc)' }}
                  >
                    <span
                      onClick={() => s.updateTask(t2.id, done ? { st: 'prog', pg: t2.pg } : { st: 'done', pg: 100 })}
                      style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${done ? 'var(--ok)' : 'var(--txt3)'}`, background: done ? 'var(--ok)' : 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}
                    >
                      {done && (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
                      )}
                    </span>
                    <span
                      onClick={() => { s.set({ projectId: t2.pid }); s.openTask(t2.id); }}
                      style={{ flex: 1, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: done ? 'var(--txt3)' : 'var(--txt)', textDecoration: done ? 'line-through' : 'none', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                    >
                      {t2.name}
                    </span>
                    {g.inbox ? (
                      <Hover
                        as="span"
                        onClick={() => setMoveFor(moveFor === t2.id ? null : t2.id)}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', border: '1px solid var(--acc2)', borderRadius: 99, padding: '2.5px 9px', flex: 'none', cursor: 'pointer' }}
                        hover={{ borderColor: 'var(--acc)' }}
                      >
                        {t('mytasks.move')} ▾
                      </Hover>
                    ) : (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'var(--txt2)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 99, padding: '2.5px 9px', flex: 'none' }}>
                        <span style={{ width: 6, height: 6, borderRadius: 2, background: p?.color || 'var(--txt3)' }} />
                        {p?.code || ''}
                      </span>
                    )}
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: !done && e < TODAY ? 'var(--bdT)' : 'var(--txt3)', flex: 'none' }}>{fmt(e)}</span>
                  </Hover>
                  {g.inbox && moveFor === t2.id && (
                    <div style={{ marginTop: 5, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: 9, animation: 'vup .15s ease' }}>
                      {wsList.map((w) => {
                        const ps = s.projects.filter((x) => x.ws === w.id && x.code !== INBOX_CODE);
                        if (!ps.length) return null;
                        return (
                          <div key={w.id} style={{ marginBottom: 6 }}>
                            <div style={{ fontSize: 9, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{w.name}</div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                              {ps.map((x) => (
                                <span
                                  key={x.id}
                                  onClick={() => {
                                    setMoveFor(null);
                                    s.moveTask(t2.id, x.id)
                                      .then(() => s.pushToast('Dipindahkan ke ' + x.name))
                                      .catch(() => s.pushToast('Gagal memindahkan task', 'bad'));
                                  }}
                                  style={{ fontSize: 10.5, fontWeight: 600, border: '1px solid var(--line)', borderRadius: 99, padding: '3px 10px', cursor: 'pointer', color: 'var(--txt2)' }}
                                >
                                  <span style={{ display: 'inline-block', width: 6, height: 6, borderRadius: 2, background: x.color, marginRight: 5 }} />
                                  {x.name}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                      {!wsList.some((w) => s.projects.some((x) => x.ws === w.id && x.code !== INBOX_CODE)) && (
                        <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{t('mytasks.noProjects')}</span>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
