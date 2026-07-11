// WebSocket hub for real-time presence + live updates. Clients authenticate with
// their access token (?token=), then receive events for every workspace they belong to.
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma.ts';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';

type Client = { ws: WebSocket; userId: string; workspaces: Set<string> };
const clients = new Set<Client>();

// presence: workspaceId -> Map<userId, count>
const presence = new Map<string, Map<string, number>>();

function presenceList(workspaceId: string): string[] {
  return [...(presence.get(workspaceId)?.keys() ?? [])];
}

function addPresence(c: Client) {
  for (const ws of c.workspaces) {
    const m = presence.get(ws) || new Map();
    m.set(c.userId, (m.get(c.userId) || 0) + 1);
    presence.set(ws, m);
    broadcast(ws, { type: 'presence', payload: { workspaceId: ws, online: presenceList(ws) } });
  }
}
function removePresence(c: Client) {
  for (const ws of c.workspaces) {
    const m = presence.get(ws);
    if (!m) continue;
    const n = (m.get(c.userId) || 1) - 1;
    if (n <= 0) m.delete(c.userId); else m.set(c.userId, n);
    broadcast(ws, { type: 'presence', payload: { workspaceId: ws, online: presenceList(ws) } });
  }
}

// Broadcast to everyone in a workspace, or to a single user via "user:<id>".
export function broadcast(channel: string, message: any) {
  const data = JSON.stringify(message);
  const userTarget = channel.startsWith('user:') ? channel.slice(5) : null;
  for (const c of clients) {
    if (c.ws.readyState !== WebSocket.OPEN) continue;
    if (userTarget ? c.userId === userTarget : c.workspaces.has(channel)) {
      try { c.ws.send(data); } catch { /* ignore */ }
    }
  }
}

export function attachWs(server: Server) {
  const wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', async (ws, req) => {
    try {
      const url = new URL(req.url || '', 'http://x');
      const token = url.searchParams.get('token') || '';
      const payload = jwt.verify(token, ACCESS_SECRET) as any;
      const userId = payload.sub as string;
      const memberships = await prisma.membership.findMany({ where: { userId }, select: { workspaceId: true } });
      const client: Client = { ws, userId, workspaces: new Set(memberships.map((m) => m.workspaceId)) };
      clients.add(client);
      addPresence(client);
      ws.send(JSON.stringify({ type: 'connected', payload: { userId } }));
      ws.on('close', () => { clients.delete(client); removePresence(client); });
      ws.on('message', (raw) => {
        try {
          const msg = JSON.parse(raw.toString());
          if (msg.type === 'ping') ws.send(JSON.stringify({ type: 'pong' }));
        } catch { /* ignore */ }
      });
    } catch {
      ws.close(4001, 'unauthorized');
    }
  });
  // keepalive
  const interval = setInterval(() => {
    for (const c of clients) { if (c.ws.readyState === WebSocket.OPEN) { try { c.ws.ping(); } catch { /* ignore */ } } }
  }, 30000);
  wss.on('close', () => clearInterval(interval));
}
