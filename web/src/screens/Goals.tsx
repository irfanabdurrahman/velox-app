import { useEffect, useState } from 'react';
import { useStore } from '../store';
import { api } from '../api';
import { Hover } from '../components/Hover';
import { fmt, TODAY, dateOf } from '../lib/dates';

type KrRow = { id: string; name: string; target: number; current: number; pid: string | null; projName: string | null };
type GoalRow = { id: string; name: string; ord: number; krs: KrRow[] };

const pctOf = (k: KrRow) => Math.max(0, Math.min(100, Math.round((k.current / Math.max(1, k.target)) * 100)));

export function Goals() {
  const s = useStore();
  const td = dateOf(TODAY);
  const title = `Goals — ${td.getUTCMonth() < 6 ? 'H1' : 'H2'} ${td.getUTCFullYear()}`;
  const wsName = s.workspaces.find((w) => w.id === s.ws)?.name || '';
  const canManage = ['OWNER', 'ADMIN', 'MANAGER'].includes(s.myRoles[s.ws] || '');
  const wsProjects = s.projects.filter((p) => p.ws === s.ws);

  const [goals, setGoals] = useState<GoalRow[] | null>(null);
  useEffect(() => {
    let alive = true;
    setGoals(null);
    api.goals(s.ws).then((g: GoalRow[]) => { if (alive) setGoals(g); }).catch(() => { if (alive) setGoals([]); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.ws]);

  const fail = (e: any) => s.pushToast(e?.message || 'Request failed', 'bad');
  const addGoal = async () => {
    const name = window.prompt('Objective name (e.g. "Ship procurement automation")'); if (!name?.trim()) return;
    try { const g = await api.createGoal(s.ws, name.trim()); setGoals((gs) => [...(gs || []), g]); } catch (e) { fail(e); }
  };
  const removeGoal = async (g: GoalRow) => {
    if (!window.confirm(`Delete goal "${g.name}" and its key results?`)) return;
    try { await api.delGoal(g.id); setGoals((gs) => (gs || []).filter((x) => x.id !== g.id)); } catch (e) { fail(e); }
  };
  const addKr = async (g: GoalRow) => {
    const name = window.prompt('Key result (measurable, e.g. "Pilot with 2 suppliers")'); if (!name?.trim()) return;
    try { const k = await api.addKr(g.id, { name: name.trim() }); setGoals((gs) => (gs || []).map((x) => (x.id === g.id ? { ...x, krs: [...x.krs, k] } : x))); } catch (e) { fail(e); }
  };
  const patchKr = async (g: GoalRow, kr: KrRow, patch: any) => {
    try { const k = await api.patchKr(kr.id, patch); setGoals((gs) => (gs || []).map((x) => (x.id === g.id ? { ...x, krs: x.krs.map((y) => (y.id === kr.id ? k : y)) } : x))); } catch (e) { fail(e); }
  };
  const removeKr = async (g: GoalRow, kr: KrRow) => {
    try { await api.delKr(kr.id); setGoals((gs) => (gs || []).map((x) => (x.id === g.id ? { ...x, krs: x.krs.filter((y) => y.id !== kr.id) } : x))); } catch (e) { fail(e); }
  };

  const gPct = (g: GoalRow) => (g.krs.length ? Math.round(g.krs.reduce((a, k) => a + pctOf(k), 0) / g.krs.length) : 0);
  const barC = (p: number) => (p >= 70 ? 'var(--ok)' : p >= 35 ? 'var(--acc)' : 'var(--wa)');
  const numIn = { width: 52, fontSize: 11, border: '1px solid var(--line)', borderRadius: 6, padding: '3px 5px', background: 'var(--inputBg)', color: 'var(--txt)', outline: 'none' } as const;

  // fallback: goals derived from projects + milestone tasks (read-only view)
  const derived = wsProjects.map((p, i) => {
    const pct = Math.max(0, Math.min(100, Math.round(p.prog)));
    const risk = p.st === 'risk' || p.st === 'bad';
    return {
      tag: 'O' + (i + 1), n: p.name, pct,
      c: risk ? 'var(--wa)' : pct >= 70 ? 'var(--ok)' : 'var(--acc)',
      co: risk ? 'var(--waT)' : pct >= 70 ? 'var(--okT)' : 'var(--accT)',
      krs: s.tasks.filter((t) => t.pid === p.id && t.ms).slice(0, 3).map((m) => ({
        n: m.name,
        v: m.st === 'done' ? 'Done' : m.e != null ? 'due ' + fmt(m.e) : '—',
        dot: m.st === 'done' ? 'var(--ok)' : m.e != null && m.e < TODAY ? 'var(--wa)' : 'var(--in)',
      })),
    };
  });

  return (
    <div data-screen-label="Goals" style={{ flex: 1, minHeight: 0, overflowY: 'auto', background: 'var(--bg)', padding: '16px 20px' }}>
      <div style={{ maxWidth: 840, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, marginBottom: 14 }}>
          <span style={{ fontSize: 17, fontWeight: 800, letterSpacing: '-.02em' }}>{title}</span>
          <span style={{ fontSize: 11.5, color: 'var(--txt3)' }}>{wsName}</span>
          <span style={{ flex: 1 }} />
          {canManage && (
            <Hover as="span" onClick={addGoal} style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', border: '1px solid var(--acc2)', borderRadius: 8, padding: '5px 12px', cursor: 'pointer' }} hover={{ background: 'var(--acc)', color: '#fff' }}>＋ New goal</Hover>
          )}
        </div>

        {goals === null && <div style={{ fontSize: 12, color: 'var(--txt3)', padding: '30px 0', textAlign: 'center' }}>Loading goals…</div>}

        {goals !== null && goals.length > 0 && goals.map((g, gi) => {
          const p = gPct(g);
          return (
            <div key={g.id} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 17px', marginBottom: 10, boxShadow: 'var(--sh1)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '2px 9px' }}>O{gi + 1}</span>
                <span style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{g.name}</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: 'var(--txt)' }}>{p}%</span>
                {canManage && <Hover as="span" onClick={() => removeGoal(g)} title="Delete goal" style={{ fontSize: 11, color: 'var(--txt3)', cursor: 'pointer', padding: '2px 5px' }} hover={{ color: 'var(--bdT)' }}>✕</Hover>}
              </div>
              <div style={{ height: 7, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginBottom: g.krs.length || canManage ? 10 : 0 }}>
                <div style={{ width: `${p}%`, height: '100%', background: barC(p), borderRadius: 99, transition: 'width .25s' }} />
              </div>
              {g.krs.map((k) => (
                <div key={k.id} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '5px 0', fontSize: 12, color: 'var(--txt2)' }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: barC(pctOf(k)), flex: 'none' }} />
                  <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{k.name}</span>
                  {k.pid
                    ? <span style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '2px 8px', flex: 'none' }} title={`Auto-tracked from project progress`}>{k.projName || 'project'} · {pctOf(k)}%</span>
                    : canManage
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flex: 'none' }}>
                          <input type="number" defaultValue={k.current} onBlur={(e) => { const v = parseInt(e.target.value || '0', 10); if (v !== k.current) patchKr(g, k, { current: v }); }} style={numIn} />
                          <span style={{ color: 'var(--txt3)', fontSize: 10.5 }}>/ {k.target}</span>
                        </span>
                      : <span style={{ fontWeight: 700, color: 'var(--txt)', flex: 'none' }}>{k.current} / {k.target}</span>}
                  {canManage && !k.pid && (
                    <select value="" onChange={(e) => e.target.value && patchKr(g, k, { pid: e.target.value })} title="Link to a project (auto progress)" style={{ width: 20, fontSize: 10, border: '1px solid var(--line)', borderRadius: 6, background: 'var(--inputBg)', color: 'var(--txt3)', flex: 'none' }}>
                      <option value="">⛓</option>
                      {wsProjects.map((pr) => <option key={pr.id} value={pr.id}>{pr.name}</option>)}
                    </select>
                  )}
                  {canManage && k.pid && <Hover as="span" onClick={() => patchKr(g, k, { pid: null })} title="Unlink project" style={{ fontSize: 10, color: 'var(--txt3)', cursor: 'pointer', flex: 'none' }} hover={{ color: 'var(--bdT)' }}>unlink</Hover>}
                  {canManage && <Hover as="span" onClick={() => removeKr(g, k)} title="Remove key result" style={{ fontSize: 11, color: 'var(--txt3)', cursor: 'pointer', flex: 'none' }} hover={{ color: 'var(--bdT)' }}>✕</Hover>}
                </div>
              ))}
              {canManage && (
                <Hover as="span" onClick={() => addKr(g)} style={{ display: 'inline-block', fontSize: 11, fontWeight: 600, color: 'var(--accT)', cursor: 'pointer', marginTop: 4 }} hover={{ textDecoration: 'underline' }}>＋ Add key result</Hover>
              )}
            </div>
          );
        })}

        {goals !== null && goals.length === 0 && (
          <>
            <div style={{ fontSize: 11, color: 'var(--txt3)', margin: '2px 0 10px' }}>
              No explicit goals yet{canManage ? ' — create one with “＋ New goal”' : ''}. Meanwhile, here is a roll-up of every project and its milestones:
            </div>
            {derived.map((g) => (
              <div key={g.tag} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: '15px 17px', marginBottom: 10, boxShadow: 'var(--sh1)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 9 }}>
                  <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 99, padding: '2px 9px' }}>{g.tag}</span>
                  <span style={{ fontSize: 13.5, fontWeight: 800, flex: 1 }}>{g.n}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: g.co }}>{g.pct}%</span>
                </div>
                <div style={{ height: 7, borderRadius: 99, background: 'var(--muB)', overflow: 'hidden', marginBottom: g.krs.length ? 10 : 0 }}>
                  <div style={{ width: `${g.pct}%`, height: '100%', background: g.c, borderRadius: 99 }} />
                </div>
                {g.krs.map((k, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '4px 0', fontSize: 12, color: 'var(--txt2)' }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: k.dot, flex: 'none' }} />
                    <span style={{ flex: 1 }}>{k.n}</span>
                    <span style={{ fontWeight: 700, color: 'var(--txt)' }}>{k.v}</span>
                  </div>
                ))}
              </div>
            ))}
            {derived.length === 0 && (
              <div style={{ textAlign: 'center', padding: '44px 0' }}>
                <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>No goals yet</div>
                <div style={{ fontSize: 12, color: 'var(--txt3)' }}>Create a project and its progress will roll up here as a goal.</div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
