import { useStore } from '../store';
import { Hover } from '../components/Hover';
import { ACCENTS, ACCENT_LABEL, ACCENT_SWATCH } from '../lib/meta';
import { setLang, getLang, useLang } from '../lib/i18n';
import { IntegrationsPanel } from '../components/settings/IntegrationsPanel';
import { AutomationsPanel } from '../components/settings/AutomationsPanel';
import { SecurityPanel } from '../components/settings/SecurityPanel';
import { NotificationsPanel } from '../components/settings/NotificationsPanel';

const setTabDefs: [string, string][] = [
  ['cats', 'Categories'],
  ['integrations', 'Integrations'],
  ['auto', 'Automations'],
  ['tpl', 'Templates'],
  ['app', 'Appearance'],
  ['security', 'Security'],
  ['notif', 'Notifications'],
];

const catColor: Record<string, string> = { dt: '#0EA5E9', sf: '#10B981', infra: '#6366F1', kaizen: '#F59E0B', it: '#64748B' };

export function Settings() {
  const s = useStore();
  const lang = useLang();
  const demoToast = () => s.pushToast('Demo preview — not yet functional');
  const canWrite = !['GUEST', 'EXEC_VIEWER'].includes(s.myRoles[s.ws]);

  const tab = s.setTab;

  const tplCards = [
    { ic: '🏗️', n: 'Factory Relocation Project', d: 'Relokasi pabrik end-to-end: site prep sampai ramp-up produksi', rows: ['Site preparation & permits (IMB)', 'Machine disassembly & transport', 'Reassembly & commissioning', 'IT / facility fit-out & ramp-up'] },
    { ic: '⚡', n: 'Software Sprint', d: '2-week sprint: planning → build → review → retro', rows: ['Sprint planning & goal', 'Build (10 slots)', 'QA + review gate', 'Retro & carry-over'] },
    { ic: '🏭', n: 'Manufacturing Kaizen / QCC', d: 'A3 problem-solving with QCC cadence', rows: ['Theme & baseline (A3)', 'Root cause (5-why / fishbone)', 'Countermeasure trials', 'Standardize + yokoten'] },
    { ic: '🎪', n: 'Event', d: 'Run-of-show, vendors, logistics, comms', rows: ['Venue & budget', 'Vendor contracts', 'Run-of-show', 'Post-event report'] },
    { ic: '🎯', n: 'OKR Cycle', d: 'Quarterly objectives with weekly check-ins', rows: ['Draft objectives', 'Align key results', 'Weekly check-ins ×12', 'Scoring & reset'] },
    { ic: '📋', n: 'Audit Preparation', d: 'Evidence tracker with findings workflow', rows: ['Scope & evidence list', 'Gap assessment', 'Remediation tasks', 'Mock audit + readout'] },
  ];
  const themes: [string, string][] = [['light', 'Light'], ['dark', 'Dark'], ['system', 'System']];
  const dens: [string, string][] = [['comf', 'Comfortable'], ['comp', 'Compact (Excel-like)']];
  const langs: [string, string][] = [['en', 'English (EN)'], ['id', 'Bahasa Indonesia (ID)']];
  const catRows = s.categories.map((c) => ({ n: c.label, c: catColor[c.id], count: s.projects.filter((p) => p.cat === c.id).length }));

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', background: 'var(--bg)' }}>
      <div style={{ width: 196, flex: 'none', borderRight: '1px solid var(--line)', background: 'var(--panel)', padding: '14px 8px' }}>
        <div style={{ fontSize: 10, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.07em', padding: '0 8px 8px' }}>Settings</div>
        {setTabDefs.map(([id, n]) => (
          <Hover key={id} onClick={() => s.set({ setTab: id })} style={{ padding: '7px 10px', borderRadius: 8, cursor: 'pointer', fontSize: 12.5, background: tab === id ? 'var(--accS)' : 'transparent', color: tab === id ? 'var(--accT)' : 'var(--txt2)', fontWeight: tab === id ? 700 : 500, marginBottom: 1 }} hover={{ background: 'var(--hover)' }}>{n}</Hover>
        ))}
      </div>
      <div style={{ flex: 1, minWidth: 0, overflowY: 'auto', padding: '18px 22px' }}>

        {tab === 'integrations' && <IntegrationsPanel ws={s.ws} canWrite={canWrite} />}

        {tab === 'auto' && <AutomationsPanel ws={s.ws} canWrite={canWrite} />}

        {tab === 'security' && <SecurityPanel ws={s.ws} />}

        {tab === 'notif' && <NotificationsPanel />}

        {tab === 'tpl' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Templates</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Start projects from proven playbooks.</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(250px,1fr))', gap: 11 }}>
              {tplCards.map((t) => (
                <Hover key={t.n} style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 15, boxShadow: 'var(--sh1)', display: 'flex', flexDirection: 'column' }} hover={{ borderColor: 'var(--acc)' }}>
                  <div style={{ fontSize: 19, marginBottom: 7 }}>{t.ic}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 3 }}>{t.n}</div>
                  <div style={{ fontSize: 10.5, color: 'var(--txt3)', lineHeight: 1.5, marginBottom: 9, flex: 1 }}>{t.d}</div>
                  {t.rows.map((r0) => <div key={r0} style={{ fontSize: 10, color: 'var(--txt2)', padding: '1.5px 0 1.5px 12px', position: 'relative' }}><span style={{ position: 'absolute', left: 1, top: 6, width: 4, height: 4, borderRadius: '50%', background: 'var(--acc)' }} />{r0}</div>)}
                  <span onClick={() => s.set({ onb: { step: 3, newProj: true, mode: 'tpl', tpl: t.n } })} style={{ marginTop: 10, textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 8, padding: 6, cursor: 'pointer' }}>Use template</span>
                </Hover>
              ))}
            </div>
          </>
        )}

        {tab === 'app' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 15 }}>Appearance &amp; language</div>
            <div style={{ background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14, padding: 16, boxShadow: 'var(--sh1)', maxWidth: 520 }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Theme</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {themes.map(([id, n]) => { const on = s.theme === id; return <span key={id} onClick={() => s.set({ theme: id as any })} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)' }}>{n}</span>; })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Density</div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {dens.map(([id, n]) => { const on = s.density === id; return <span key={id} onClick={() => s.set({ density: id as any })} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)' }}>{n}</span>; })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Accent theme</div>
              <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
                {ACCENTS.map((id) => {
                  const c = ACCENT_SWATCH[id]; const n = ACCENT_LABEL[id]; const on = (s.accent || 'indigo') === id;
                  return (
                    <span key={id} onClick={() => { s.set({ accent: id }); s.pushToast('Accent theme: ' + n); }} title={n} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, cursor: 'pointer' }}>
                      <Hover as="span" style={{ width: 34, height: 34, borderRadius: '50%', background: c, boxShadow: on ? '0 0 0 2.5px var(--card),0 0 0 5px ' + c : 'var(--sh1)', display: 'grid', placeItems: 'center', transition: 'transform .15s' }} hover={{ transform: 'scale(1.08)' }}>{on && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.5" strokeLinecap="round"><path d="M5 13l4 4L19 7" /></svg>}</Hover>
                      <span style={{ fontSize: 9.5, fontWeight: 700, color: on ? 'var(--accT)' : 'var(--txt3)' }}>{n}</span>
                    </span>
                  );
                })}
              </div>
              <div style={{ fontSize: 11, fontWeight: 800, color: 'var(--txt3)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 8 }}>Language</div>
              <div style={{ display: 'flex', gap: 8 }}>
                {langs.map(([id, n]) => { const on = (lang || getLang()) === id; return <span key={id} onClick={() => { setLang(id as any); s.pushToast(id === 'id' ? 'Bahasa diubah ke Indonesia' : 'Language set to English'); }} style={{ flex: 1, textAlign: 'center', fontSize: 12, fontWeight: 700, padding: 9, borderRadius: 10, cursor: 'pointer', border: `1.5px solid ${on ? 'var(--acc)' : 'var(--line)'}`, background: on ? 'var(--accS)' : 'transparent', color: on ? 'var(--accT)' : 'var(--txt2)' }}>{n}</span>; })}
              </div>
              <div style={{ fontSize: 10.5, color: 'var(--txt3)', marginTop: 8 }}>Switching language updates all translated UI strings instantly.</div>
            </div>
          </>
        )}

        {tab === 'cats' && (
          <>
            <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Project categories</div>
            <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Portfolios that group projects in the sidebar &amp; dashboard.</div>
            <div style={{ maxWidth: 520 }}>
              {catRows.map((c) => (
                <div key={c.n} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 12, padding: '11px 14px', marginBottom: 7, boxShadow: 'var(--sh1)' }}>
                  <span style={{ width: 10, height: 10, borderRadius: 3.5, background: c.c }} />
                  <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{c.n}</span>
                  <span style={{ fontSize: 10.5, color: 'var(--txt3)' }}>{c.count} projects</span>
                  <Hover as="span" onClick={demoToast} style={{ fontSize: 10.5, fontWeight: 700, color: 'var(--txt3)', cursor: 'pointer' }} hover={{ color: 'var(--accT)' }}>Rename</Hover>
                </div>
              ))}
              <span onClick={demoToast} style={{ display: 'inline-flex', fontSize: 11.5, fontWeight: 700, color: 'var(--accT)', background: 'var(--accS)', borderRadius: 9, padding: '7px 13px', cursor: 'pointer' }}>＋ New category</span>
            </div>
          </>
        )}

      </div>
    </div>
  );
}
