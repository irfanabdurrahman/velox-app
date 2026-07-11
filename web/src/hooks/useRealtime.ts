import { useEffect } from 'react';
import { useStore } from '../store';
import { getToken } from '../api';

// Connects to the server WebSocket for live presence + task updates. Reconnects
// with backoff. No-ops until authed.
export function useRealtime() {
  const authed = useStore((s) => s.authed);
  useEffect(() => {
    if (!authed) return;
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let pingTimer: any;

    const connect = () => {
      const token = getToken();
      if (!token) return;
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      // dev: talk to the API directly (Vite doesn't proxy ws by default); prod: same origin
      const host = location.port === '5173' ? `${location.hostname}:4000` : location.host;
      ws = new WebSocket(`${proto}://${host}/ws?token=${encodeURIComponent(token)}`);
      ws.onopen = () => {
        retry = 0;
        pingTimer = setInterval(() => ws?.readyState === WebSocket.OPEN && ws.send(JSON.stringify({ type: 'ping' })), 25000);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type && msg.type !== 'pong' && msg.type !== 'connected') useStore.getState().applyLive(msg);
        } catch { /* ignore */ }
      };
      ws.onclose = () => {
        clearInterval(pingTimer);
        if (closed) return;
        retry = Math.min(retry + 1, 6);
        setTimeout(connect, 500 * 2 ** retry);
      };
      ws.onerror = () => { try { ws?.close(); } catch { /* ignore */ } };
    };
    connect();
    return () => { closed = true; clearInterval(pingTimer); try { ws?.close(); } catch { /* ignore */ } };
  }, [authed]);
}
