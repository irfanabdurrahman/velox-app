// Shared API-key auth used by the public REST API (routes/publicApi.ts) and the
// MCP tool server (routes/mcp.ts). Keys are presented as `Authorization: Bearer vlx_...`.
// We store only a sha256 hash of the key, never the raw value.
import { createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma.ts';

export const hashApiKey = (raw: string) => createHash('sha256').update(raw).digest('hex');

// Request decorated by apiKeyAuth with the resolved key context.
export interface ApiKeyRequest extends Request {
  workspaceId?: string;
  scopes?: string[];
  apiKeyId?: string;
}

// Express middleware: resolve a non-revoked ApiKey from the Bearer token, attach
// workspaceId/scopes/apiKeyId to the request, bump lastUsedAt. 401 on any failure.
export async function apiKeyAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
    if (!token || !token.startsWith('vlx_')) return res.status(401).json({ error: 'missing or invalid API key' });
    const key = await prisma.apiKey.findUnique({ where: { keyHash: hashApiKey(token) } });
    if (!key || key.revoked) return res.status(401).json({ error: 'invalid or revoked API key' });
    req.workspaceId = key.workspaceId;
    req.scopes = (key.scopes as string[]) || [];
    req.apiKeyId = key.id;
    await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
    next();
  } catch {
    res.status(500).json({ error: 'internal error' });
  }
}

// Express middleware factory that rejects with 403 unless the key carries `scope`.
export function requireScope(scope: string) {
  return (req: ApiKeyRequest, res: Response, next: NextFunction) => {
    if (!req.scopes?.includes(scope)) return res.status(403).json({ error: `missing required scope: ${scope}` });
    next();
  };
}

// Throwing variant for imperative dispatch (used by the MCP tool router).
export function hasScope(req: ApiKeyRequest, scope: string) {
  return !!req.scopes?.includes(scope);
}
