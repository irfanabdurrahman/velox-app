import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { fmt, TODAY } from '../lib/dates';
import { t, useLang } from '../lib/i18n';

export function MyTasks() {
  const s = useStore();
  useLang(); // re-render on language switch
  const uid = s.user?.id;
  const mine = s.tasks.filter((t) => t.a === uid && !t.ms && t.s !== null);

  const grp: { over: typeof mine; today: typeof mine; week: typeof mine; later: typeof mine } = { over: [], today: [], week: [], later: [] };
  mine.forEach((t) => {
    const e = t.e ?? 0;
    if (t.st !== 'done' && e < TODAY) grp.over.push(t);
    else if (e === TODAY) grp.today.push(t);
    else if (e <= TODAY + 3) grp.week.push(t);
    else grp.later.push(t);
  });

  const groups = [
    { label: t('mytasks.overdue'), co: 'var(--bdT)', bgc: 'var(--bdB)', items: grp.over },
    { label: t('mytasks.today'), co: 'var(--accT)', bgc: 'var(--accS)', items: grp.today },
    { label: t('mytasks.week'), co: 'var(--txt2)', bgc: 'var(--muB)', items: grp.week },
    { label: t('mytasks.later'), co: 'var(--txt3)', bgc: 'var(--muB)', items: grp.later },
  ].filter((g) => g.items.length);

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
            </div>
            {g.items.map((t) => {
              const p = s.proj(t.pid);
              const done = t.st === 'done';
              const e = t.e ?? 0;
              return (
                <Hover
                  key={t.id}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '9px 13px', marginBottom: 6, boxShadow: 'var(--sh1)' }}
                  hover={{ borderColor: 'var(--acc)' }}
                >
                  <span
                    onClick={() => s.updateTask(t.id, done ? { st: 'prog', pg: t.pg } : { st: 'done', pg: 100 })}
                    style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${done ? 'var(--ok)' : 'var(--txt3)'}`, background: done ? 'var(--ok)' : 'transparent', display: 'grid', placeItems: 'center', cursor: 'pointer', flex: 'none' }}
                  >
                    {done && (
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5"><path d="M5 13l4 4L19 7" /></svg>
                    )}
                  </span>
                  <span
                    onClick={() => { s.set({ projectId: t.pid }); s.openTask(t.id); }}
                    style={{ flex: 1, fontSize: 13, fontWeight: 600, cursor: 'pointer', color: done ? 'var(--txt3)' : 'var(--txt)', textDecoration: done ? 'line-through' : 'none', minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
                  >
                    {t.name}
                  </span>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, color: 'var(--txt2)', background: 'var(--bg)', border: '1px solid var(--line)', borderRadius: 99, padding: '2.5px 9px', flex: 'none' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 2, background: p?.color || 'var(--txt3)' }} />
                    {p?.code || ''}
                  </span>
                  <span style={{ fontSize: 10.5, fontWeight: 700, color: !done && e < TODAY ? 'var(--bdT)' : 'var(--txt3)', flex: 'none' }}>{fmt(e)}</span>
                </Hover>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
