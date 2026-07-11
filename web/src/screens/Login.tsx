import { useState, useEffect } from 'react';
import { useStore } from '../store';
import { api } from '../api';

// Recognizable provider marks (official logos) — no fabricated branding.
const GoogleMark = (
  <svg width="16" height="16" viewBox="0 0 48 48" style={{ flex: 'none' }}>
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
  </svg>
);
const MsMark = (
  <svg width="15" height="15" viewBox="0 0 23 23" style={{ flex: 'none' }}>
    <path fill="#f25022" d="M1 1h10v10H1z" /><path fill="#7fba00" d="M12 1h10v10H12z" />
    <path fill="#00a4ef" d="M1 12h10v10H1z" /><path fill="#ffb900" d="M12 12h10v10H12z" />
  </svg>
);
const ssoBtn = { width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, background: 'var(--card)', color: 'var(--txt)', border: '1px solid var(--line)', borderRadius: 10, padding: '10px', fontSize: 13, fontWeight: 600, cursor: 'pointer' } as const;

export function Login() {
  const loginWith = useStore((s) => s.loginWith);
  const pushToast = useStore((s) => s.pushToast);
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [sso, setSso] = useState<{ google: boolean; microsoft: boolean } | null>(null);

  // Only render SSO buttons for providers the server actually has configured.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('sso') === 'error') setErr('SSO sign-in failed');
    // ?sso=ok → the callback already set the session cookie; app bootstrap picks it up.
    api.ssoStatus()
      .then((r: any) => setSso({ google: !!r.google, microsoft: !!r.microsoft }))
      .catch(() => setSso(null));
  }, []);

  const submit = async () => {
    if (busy) return;
    setErr('');
    if (!email.trim()) { setErr('Email wajib diisi.'); return; }
    if (!password) { setErr('Password wajib diisi.'); return; }
    if (mode === 'up' && password.length < 8) { setErr('Password minimal 8 karakter.'); return; }
    setBusy(true);
    try {
      const r = mode === 'in' ? await api.login(email, password)
        : await api.register(name || 'New User', email, password);
      await loginWith(r.token, r.user);
      pushToast(r.created ? `Welcome to Velox, ${r.user.name.split(' ')[0]}!` : `Welcome back, ${r.user.name.split(' ')[0]}!`);
    } catch (e: any) {
      const msg = e?.message || (mode === 'in' ? 'Sign in failed' : 'Sign up failed');
      setErr(msg);
      pushToast(msg, 'bad');
    } finally {
      setBusy(false);
    }
  };

  const input = (props: any) => (
    <input {...props} style={{ width: '100%', background: 'var(--inputBg)', border: '1px solid var(--line)', borderRadius: 10, padding: '11px 13px', fontSize: 13.5, color: 'var(--txt)', marginBottom: 10 }} />
  );

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: 'var(--bg)', color: 'var(--txt)', fontFamily: 'Inter, system-ui, sans-serif', padding: 20 }}>
      <div style={{ width: 400, maxWidth: '92vw', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 18, boxShadow: 'var(--sh3)', padding: '30px 30px 26px', animation: 'vpop .2s ease' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 22 }}>
          <div style={{ width: 34, height: 34, borderRadius: 9, background: 'linear-gradient(135deg,var(--acc),var(--acc2))', display: 'grid', placeItems: 'center', boxShadow: 'var(--sh1)' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 4l7 8-7 8" /><path d="M13 4l7 8-7 8" /></svg>
          </div>
          <span style={{ fontSize: 22, fontWeight: 800, fontStyle: 'italic', letterSpacing: '-.035em' }}>velox</span>
        </div>
        <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 4 }}>{mode === 'in' ? 'Masuk ke Velox' : 'Buat akun baru'}</div>
        <div style={{ fontSize: 12.5, color: 'var(--txt2)', marginBottom: 20 }}>{mode === 'in' ? 'Kelola proyek Anda dengan cepat.' : 'Mulai kelola proyek dalam hitungan menit.'}</div>

        {mode === 'up' && input({ value: name, onChange: (e: any) => setName(e.target.value), placeholder: 'Nama lengkap' })}
        {input({ value: email, onChange: (e: any) => setEmail(e.target.value), placeholder: 'Email', type: 'email' })}
        {input({ value: password, onChange: (e: any) => setPassword(e.target.value), placeholder: mode === 'up' ? 'Password (min. 8 karakter)' : 'Password', type: 'password', onKeyDown: (e: any) => e.key === 'Enter' && submit() })}

        <button onClick={submit} disabled={busy} style={{ width: '100%', background: 'var(--acc)', color: '#fff', border: 'none', borderRadius: 10, padding: '11px', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px var(--ring)' }}>
          {busy ? '…' : mode === 'in' ? 'Masuk →' : 'Create account →'}
        </button>

        {err && <div style={{ marginTop: 10, fontSize: 11.5, fontWeight: 600, color: 'var(--bdT)', lineHeight: 1.4 }}>{err}</div>}

        {(sso?.google || sso?.microsoft) && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '16px 0 12px' }}>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
              <span style={{ fontSize: 11, color: 'var(--txt3)' }}>atau</span>
              <div style={{ flex: 1, height: 1, background: 'var(--line)' }} />
            </div>
            {sso.google && (
              <button onClick={() => { window.location.href = '/api/auth/google'; }} style={ssoBtn}>{GoogleMark} Continue with Google</button>
            )}
            {sso.microsoft && (
              <button onClick={() => { window.location.href = '/api/auth/microsoft'; }} style={{ ...ssoBtn, marginTop: 8 }}>{MsMark} Continue with Microsoft</button>
            )}
          </>
        )}

        <div style={{ textAlign: 'center', marginTop: 16, fontSize: 12, color: 'var(--txt2)' }}>
          {mode === 'in' ? (
            <>Belum punya akun? <span onClick={() => { setMode('up'); setErr(''); }} style={{ color: 'var(--accT)', fontWeight: 600, cursor: 'pointer' }}>Daftar sekarang</span></>
          ) : (
            <>Sudah punya akun? <span onClick={() => { setMode('in'); setErr(''); }} style={{ color: 'var(--accT)', fontWeight: 600, cursor: 'pointer' }}>Masuk</span></>
          )}
        </div>
      </div>
    </div>
  );
}
