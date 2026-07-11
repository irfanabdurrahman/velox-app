// Security tab: two-factor authentication (TOTP) enrolment + workspace data export.
import { useState } from 'react';
import { api } from '../../api';
import { useStore } from '../../store';
import { cardStyle, mono, CardHead, btnStyle, inputStyle, Field, CopyField, Note, StatusBadge } from './kit';

export function SecurityPanel({ ws }: { ws: string }) {
  const s = useStore();
  const pushToast = s.pushToast;
  const enabled = !!(s.user as any)?.twoFAEnabled;
  const setEnabled = (v: boolean) => s.set({ user: { ...(s.user as any), twoFAEnabled: v } as any });

  const [setup, setSetup] = useState<{ qrDataUrl: string; secret: string } | null>(null);
  const [code, setCode] = useState('');
  const [disarm, setDisarm] = useState(false);
  const [disCode, setDisCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [exporting, setExporting] = useState(false);

  const startSetup = async () => {
    setBusy(true);
    try {
      const r = await api.twoFASetup();
      const secret = (() => { try { return new URL(r.otpauthUrl).searchParams.get('secret') || ''; } catch { return ''; } })();
      setSetup({ qrDataUrl: r.qrDataUrl, secret });
    } catch (e: any) { pushToast(`Could not start 2FA setup — ${e.message || e}`, 'bad'); }
    setBusy(false);
  };
  const confirmEnable = async () => {
    if (!/^\d{6}$/.test(code)) { pushToast('Enter the 6-digit code', 'bad'); return; }
    setBusy(true);
    try { await api.twoFAEnable(code); setEnabled(true); setSetup(null); setCode(''); pushToast('Two-factor authentication enabled'); }
    catch (e: any) { pushToast(`${e.message || e}`, 'bad'); }
    setBusy(false);
  };
  const confirmDisable = async () => {
    if (!/^\d{6}$/.test(disCode)) { pushToast('Enter the 6-digit code', 'bad'); return; }
    setBusy(true);
    try { await api.twoFADisable(disCode); setEnabled(false); setDisarm(false); setDisCode(''); pushToast('Two-factor authentication disabled'); }
    catch (e: any) { pushToast(`${e.message || e}`, 'bad'); }
    setBusy(false);
  };

  const doExport = async () => {
    setExporting(true);
    try {
      const data = await api.exportWs(ws);
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'velox-export.json';
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      pushToast('Export downloaded');
    } catch (e: any) { pushToast(`Export failed — ${e.message || e}`, 'bad'); }
    setExporting(false);
  };

  return (
    <>
      <div style={{ fontSize: 16, fontWeight: 800, letterSpacing: '-.02em', marginBottom: 3 }}>Security</div>
      <div style={{ fontSize: 12, color: 'var(--txt2)', marginBottom: 15 }}>Protect your account and export your data.</div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(340px,1fr))', gap: 11, alignItems: 'start' }}>

        {/* 2FA */}
        <div style={cardStyle}>
          <CardHead icon="🔐" iconBg="var(--accS)" title="Two-factor authentication"
            right={<StatusBadge on={enabled} onLabel="Enabled" offLabel="Off" />} />

          {enabled ? (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5, marginBottom: 9 }}>Your account requires a 6-digit authenticator code at sign-in.</div>
              {!disarm ? (
                <span onClick={() => setDisarm(true)} style={btnStyle('danger')}>Disable 2FA</span>
              ) : (
                <div>
                  <Field label="Enter a current 6-digit code to disable">
                    <input style={inputStyle} value={disCode} inputMode="numeric" maxLength={6} onChange={(e) => setDisCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
                  </Field>
                  <div style={{ display: 'flex', gap: 7 }}>
                    <span onClick={busy ? undefined : confirmDisable} style={btnStyle('danger', busy)}>{busy ? '…' : 'Confirm disable'}</span>
                    <span onClick={() => { setDisarm(false); setDisCode(''); }} style={btnStyle('ghost')}>Cancel</span>
                  </div>
                </div>
              )}
            </>
          ) : !setup ? (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5, marginBottom: 9 }}>Add an authenticator app (Google Authenticator, 1Password, Authy) for a second sign-in factor.</div>
              <span onClick={busy ? undefined : startSetup} style={btnStyle('primary', busy)}>{busy ? 'Preparing…' : 'Set up 2FA'}</span>
            </>
          ) : (
            <>
              <div style={{ fontSize: 11.5, color: 'var(--txt2)', marginBottom: 8 }}>1. Scan this QR in your authenticator app:</div>
              <img src={setup.qrDataUrl} alt="2FA QR code" width={148} height={148} style={{ borderRadius: 10, border: '1px solid var(--line)', background: '#fff', display: 'block', marginBottom: 8 }} />
              {setup.secret && <div style={{ marginBottom: 9 }}><CopyField value={setup.secret} label="Or enter this key manually" /></div>}
              <Field label="2. Enter the 6-digit code it shows">
                <input style={inputStyle} value={code} inputMode="numeric" maxLength={6} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="123456" />
              </Field>
              <div style={{ display: 'flex', gap: 7 }}>
                <span onClick={busy ? undefined : confirmEnable} style={btnStyle('primary', busy)}>{busy ? 'Verifying…' : 'Enable 2FA'}</span>
                <span onClick={() => { setSetup(null); setCode(''); }} style={btnStyle('ghost')}>Cancel</span>
              </div>
            </>
          )}
        </div>

        {/* Data export */}
        <div style={cardStyle}>
          <CardHead icon="⬇️" iconBg="var(--inB)" title="Data export" />
          <div style={{ fontSize: 11.5, color: 'var(--txt2)', lineHeight: 1.5, marginBottom: 10 }}>Download a full JSON snapshot of this workspace — projects, tasks, sections, custom fields, members and status updates.</div>
          <span onClick={exporting ? undefined : doExport} style={btnStyle('primary', exporting)}>{exporting ? 'Exporting…' : 'Export workspace (JSON)'}</span>
          <Note>Saved as <span style={{ fontFamily: mono }}>velox-export.json</span>. Requires manager access.</Note>
        </div>
      </div>
    </>
  );
}
