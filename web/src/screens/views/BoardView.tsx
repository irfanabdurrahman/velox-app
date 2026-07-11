import { useEffect, useRef, useState } from 'react';
import { useStore } from '../../store';
import { Hover } from '../../components/Hover';
import { prMeta, dotFor } from '../../lib/meta';
import { fmt, TODAY } from '../../lib/dates';
import type { Task } from '../../types';

const COLS: [string, string][] = [
  ['mut', 'Not started'],
  ['prog', 'In progress'],
  ['risk', 'At risk'],
  ['bad', 'Overdue'],
  ['done', 'Done'],
];

type Swim = 'none' | 'assignee' | 'priority';
const SWIMS: [Swim, string][] = [['none', 'None'], ['assignee', 'Assignee'], ['priority', 'Priority']];
const PR_LANES: [string, string][] = [['urgent', 'Urgent'], ['high', 'High'], ['med', 'Medium'], ['low', 'Low']];
const normPr = (p: string) => (['urgent', 'high', 'med', 'low'].includes(p) ? p : 'med');

type Lane = { key: string; label: string; ctx: Partial<Task>; cards: Task[] };

export function BoardView() {
  const s = useStore();
  const bdrag = s.bdrag;
  const projTasks = s.tasks.filter((t) => t.pid === s.projectId);
  const role = s.myRoles[s.ws];
  const canWrite = role !== 'GUEST' && role !== 'EXEC_VIEWER';

  const [swim, setSwim] = useState<Swim>('none');
  const [laneCol, setLaneCol] = useState<Record<string, boolean>>({});
  const toggleLane = (k: string) => setLaneCol((c) => ({ ...c, [k]: !c[k] }));

  // A card dragged OUT of Done keeps pg=100 (the move handler is frozen in
  // useInteractions) — honesty watcher: reset pg to 90 once per task id.
  const pgFixed = useRef<Set<string>>(new Set());
  useEffect(() => {
    s.tasks.forEach((t) => {
      if (!t.ms && t.st !== 'done' && t.pg === 100 && !pgFixed.current.has(t.id)) {
        pgFixed.current.add(t.id);
        s.updateTask(t.id, { pg: 90 });
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.tasks]);

  const cardDown = (t: Task, e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    s.set({ bdrag: { id: t.id, on: true, x: e.clientX, y: e.clientY, name: t.name, moved: false } });
  };

  const addToCol = (colKey: string, ctx?: Partial<Task>) => {
    const patch: Partial<Task> = { st: colKey, ...(colKey === 'done' ? { pg: 100 } : {}), ...(ctx || {}) };
    const id = s.addTask('New task', s.projectId, null, TODAY, patch);
    s.openTask(id);
  };

  // leaf, scheduled, non-milestone cards — the board universe
  const boardCards = projTasks.filter((t) => !t.ms && t.s !== null && !projTasks.some((x) => x.par === t.id));

  // ---- build swimlanes ----
  let lanes: Lane[] = [];
  if (swim === 'assignee') {
    const ids = Array.from(new Set(boardCards.flatMap((t) => [t.a, ...(t.a2 || [])]).filter((x): x is string => !!x)));
    ids.sort((a, b) => (s.members[a]?.n || a).localeCompare(s.members[b]?.n || b));
    lanes = ids.map((m) => ({
      key: 'a_' + m,
      label: s.members[m]?.n || m,
      ctx: { a: m },
      cards: boardCards.filter((t) => t.a === m || (t.a2 || []).includes(m)),
    }));
    const un = boardCards.filter((t) => !t.a && !(t.a2 && t.a2.length));
    if (un.length) lanes.push({ key: 'a_none', label: 'Unassigned', ctx: { a: null }, cards: un });
  } else if (swim === 'priority') {
    lanes = PR_LANES.map(([pk, pl]) => ({
      key: 'p_' + pk,
      label: pl,
      ctx: { pr: pk },
      cards: boardCards.filter((t) => normPr(t.pr) === pk),
    }));
  }

  const renderCard = (t: Task) => {
    const p = s.proj(t.pid);
    const late = t.st !== 'done' && (t.e ?? 0) < TODAY;
    const com = (s.comments[t.id] || []).length;
    const hi = t.pr === 'high' || t.pr === 'urgent';
    const prC = prMeta(t.pr).c;
    const op = bdrag && bdrag.id === t.id ? 0.35 : 1;
    return (
      <Hover key={t.id} onMouseDown={(e: React.MouseEvent) => cardDown(t, e)} onDoubleClick={() => s.openTask(t.id)} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 11, padding: '10px 11px', cursor: 'grab', boxShadow: 'var(--sh1)', opacity: op, transition: 'box-shadow .15s' }} hover={{ boxShadow: 'var(--sh2)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: 6 }}>
          <span style={{ width: 7, height: 7, borderRadius: 2.5, background: p?.color || 'var(--txt3)' }} />
          <span style={{ fontSize: 9.5, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.04em' }}>{(p?.code || '') + '-' + t.id.replace(/\D/g, '')}</span>
          {hi && <svg style={{ marginLeft: 'auto' }} width="10" height="10" viewBox="0 0 24 24" fill={prC} stroke={prC} strokeWidth="2"><path d="M4 21V4" /><path d="M4 4h12l-2.5 4L16 12H4" stroke="none" /></svg>}
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 600, lineHeight: 1.35, marginBottom: 8 }}>{t.name}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          {t.a && <span style={{ width: 19, height: 19, borderRadius: '50%', background: s.members[t.a]?.c || 'var(--txt3)', color: '#fff', display: 'grid', placeItems: 'center', fontSize: 7.5, fontWeight: 800 }}>{s.members[t.a] ? t.a : '?'}</span>}
          <span style={{ fontSize: 9.5, fontWeight: 700, color: late ? 'var(--bdT)' : 'var(--muT)', background: late ? 'var(--bdB)' : 'var(--muB)', borderRadius: 99, padding: '2px 7px' }}>{t.e != null ? fmt(t.e) : '—'}</span>
          {com > 0 && (
            <span style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 3, fontSize: 9.5, color: 'var(--txt3)' }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>{com}
            </span>
          )}
        </div>
      </Hover>
    );
  };

  const renderColumn = (keyId: string, k: string, label: string, laneCards: Task[], ctx: Partial<Task>, fill: boolean) => {
    const cards = laneCards.filter((t) => t.st === k);
    const over = k === 'prog' && cards.length > 3;
    const colBd = bdrag && bdrag.moved ? 'var(--acc2)' : 'transparent';
    return (
      <div key={keyId} data-col={k} style={{ width: 264, flex: 'none', display: 'flex', flexDirection: 'column', minHeight: fill ? 0 : 120, background: 'var(--bg)', borderRadius: 14, border: `1.5px dashed ${colBd}` }}>
        <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 7, padding: '11px 12px 7px' }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: dotFor(k) }} />
          <span style={{ fontSize: 12, fontWeight: 800 }}>{label}</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: over ? 'var(--bdT)' : 'var(--muT)', background: over ? 'var(--bdB)' : 'var(--muB)', borderRadius: 99, padding: '1.5px 8px' }}>{k === 'prog' ? cards.length + '/3 WIP' : cards.length + ''}</span>
          {canWrite && <Hover as="span" onClick={() => addToCol(k, ctx)} title={`Add task to ${label}`} style={{ marginLeft: 'auto', color: 'var(--txt3)', cursor: 'pointer', fontWeight: 700, borderRadius: 6, padding: '0 5px' }} hover={{ background: 'var(--hover)' }}>＋</Hover>}
        </div>
        <div style={{ flex: fill ? 1 : 'none', overflowY: fill ? 'auto' : 'visible', padding: '4px 8px 10px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {cards.map(renderCard)}
          {cards.length === 0 && <div style={{ border: '1.5px dashed var(--line)', borderRadius: 11, padding: 14, textAlign: 'center', fontSize: 11, color: 'var(--txt3)' }}>Drop cards here</div>}
        </div>
      </div>
    );
  };

  return (
    <div data-screen-label="Board view" style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', background: 'var(--bg)' }}>
      {/* toolbar: swimlanes control */}
      <div style={{ flex: 'none', display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderBottom: '1px solid var(--line)' }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.05em' }}>Swimlanes</span>
        <div style={{ display: 'flex', gap: 2, background: 'var(--muB)', borderRadius: 8, padding: 2 }}>
          {SWIMS.map(([k, l]) => (
            <Hover as="span" key={k} onClick={() => setSwim(k)} style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 6, cursor: 'pointer', color: swim === k ? '#fff' : 'var(--txt2)', background: swim === k ? 'var(--acc)' : 'transparent' }} hover={swim === k ? {} : { background: 'var(--hover)' }}>{l}</Hover>
          ))}
        </div>
      </div>

      {/* board area */}
      <div style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
        {swim === 'none' ? (
          <div style={{ height: '100%', display: 'flex', gap: 12, alignItems: 'stretch', padding: '12px 14px', width: 'max-content' }}>
            {COLS.map(([k, label]) => renderColumn(k, k, label, boardCards, {}, true))}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, padding: '12px 14px', width: 'max-content' }}>
            {lanes.length === 0 && <div style={{ fontSize: 12, color: 'var(--txt3)', padding: 8 }}>No tasks to group.</div>}
            {lanes.map((lane) => {
              const col = !!laneCol[lane.key];
              return (
                <div key={lane.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 2px' }}>
                    <svg onClick={() => toggleLane(lane.key)} style={{ cursor: 'pointer', transform: col ? 'rotate(-90deg)' : 'none', transition: 'transform .15s' }} width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="var(--txt2)" strokeWidth="2.5"><path d="M6 9l6 6 6-6" /></svg>
                    <span onClick={() => toggleLane(lane.key)} style={{ fontSize: 12.5, fontWeight: 800, cursor: 'pointer' }}>{lane.label}</span>
                    <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--muT)', background: 'var(--muB)', borderRadius: 99, padding: '1.5px 8px' }}>{lane.cards.length}</span>
                  </div>
                  {!col && (
                    <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                      {COLS.map(([k, label]) => renderColumn(lane.key + '_' + k, k, label, lane.cards, lane.ctx, false))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {bdrag && bdrag.moved && (
        <div style={{ position: 'fixed', left: bdrag.x - 120, top: bdrag.y - 20, width: 240, zIndex: 99, pointerEvents: 'none', background: 'var(--card)', border: '1.5px solid var(--acc)', borderRadius: 11, padding: '10px 11px', boxShadow: 'var(--sh3)', transform: 'rotate(2deg)' }}>
          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{bdrag.name}</div>
        </div>
      )}
    </div>
  );
}
