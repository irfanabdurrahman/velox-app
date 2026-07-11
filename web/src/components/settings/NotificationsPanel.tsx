// Notifications tab: honest channel status, per-user preference toggles, and
// Web-Push enrolment through the service worker's PushManager.
import { useEffect, useState } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import { cardStyle, CardHead, SectionTitle, Toggle, btnStyle, Note, StatusBadge, StateRow } from './kit';

const PREF_ROWS: [string, string, string][] = [
  ['digest', 'Daily digest', 'A once-a-day summary of your tasks and mentions'],
  ['mentions', 'Mentions', 'When someone @-mentions you in a comment'],
  ['assignments', 'Assignments', 'When a task is assigned to you'],
  ['statusChanges', 'Status changes', 'When a task you follow changes status'],
];

function urlB64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(base64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

export function NotificationsPanel() {
  const pushToast = useStore((s) => s.pushToast);
  const [channels, setChannels] = useState<{ email: boolean; push: boolean } | null>(null);
  const [prefs, setPrefs] = useState<Record<string, boolean> | null>(null);
  const [err, setErr] = useState('');
  const [pushOn, setPushOn] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    api.notifChannels().then((r) => live && setChannels(r)).catch((e) => live && setErr(String(e.message || e)));
    api.notifPrefs().then((r) => live && setPrefs(r || {})).catch(() => live && setPrefs({}));
    if ('serviceWorker' in navigator && 'PushManager' in window) {
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => { if (live) setPushOn(!!sub && Notification.permission === 'granted'); })
        .catch(() => {});
    }
    return () => { live = false; };
  }, []);

  const togglePref = async (key: string) => {
    const next = !(prefs?.[key]);
    setPrefs((p) => ({ ...(p || {}), [key]: next }));
    try { const r = await api.setNotifPrefs({ [key]: next }); setPrefs(r); }
    catch (e: any) { setPrefs((p) => ({ ...(p || {}), [key]: !next })); pushToast(`Could not save — ${e.message || e}`, 'bad'); }
  };

  const enablePush = async () => {
    setBusy(true);
    try {
      const v = await api.pushVapid();
      if (!v.enabled || !v.key) { pushToast('Push is not configured on this server', 'bad'); setBusy(false); return; }
      if (!('serviceWorker' in navigator) || !('PushManager' in window)) { pushToast('This browser does not support push notifications', 'bad'); setBusy(false); return; }
      const perm = await Notification.requestPermission();
      if (perm !== 'granted') { pushToast('Notification permission was not granted', 'bad'); setBusy(false); return; }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlB64ToUint8Array(v.key) as BufferSource });
      await api.pushSubscribe(sub.toJSON());
      setPushOn(true);
      pushToast('Push notifications enabled on this device');
    } catch (e: any) { pushToast(`Could not enable push — ${e.message || e}`, 'bad'); }
    setBusy(false);
  };

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Notifications</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Choose what Velox notifies you about, and how.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 11, alignItems: 'start' }}>

        {/* Channels + push */}
        <div style={cardStyle}>
          <CardHead icon="📣" iconBg="var(--accS)" title="Delivery channels" />
          {err && <StateRow text={`Could not load status — ${err}`} />}
          {!err && !channels && <StateRow text="Loading…" />}
          {channels && (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line2)' }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>In-app</span>
                <StatusBadge on onLabel="Always on" />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid var(--line2)' }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Email</span>
                <StatusBadge on={channels.email} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0' }}>
                <span style={{ flex: 1, fontSize: 12, fontWeight: 600 }}>Web push</span>
                <StatusBadge on={channels.push} />
              </div>
              <div style={{ marginTop: 11 }}>
                {channels.push ? (
                  pushOn ? <span style={{ ...btnStyle('ghost'), cursor: 'default' }}>✓ Push enabled on this device</span>
                    : <span onClick={busy ? undefined : enablePush} style={btnStyle('primary', busy)}>{busy ? 'Enabling…' : 'Enable push on this device'}</span>
                ) : (
                  <Note>Web push is <b>not configured on this server</b> (no VAPID keys). Ask an admin to configure it.</Note>
                )}
                {!channels.email && <Note>Email delivery is not configured on this server; in-app notifications still work.</Note>}
              </div>
            </>
          )}
        </div>

        {/* Preferences */}
        <div style={cardStyle}>
          <CardHead icon="⚙️" iconBg="var(--inB)" title="Preferences" />
          <SectionTitle>Notify me about</SectionTitle>
          {!prefs && <StateRow text="Loading…" />}
          {prefs && PREF_ROWS.map(([key, label, desc]) => (
            <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderTop: '1px solid var(--line2)' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 12, fontWeight: 600 }}>{label}</span>
                <span style={{ display: 'block', fontSize: 10, color: 'var(--txt3)' }}>{desc}</span>
              </span>
              <Toggle on={!!prefs[key]} onClick={() => togglePref(key)} />
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
