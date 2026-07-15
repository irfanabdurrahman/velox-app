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

// Points MCP clients at OAuth discovery metadata on a 401, per RFC 9728 —
// lets Claude.ai (and other spec-compliant clients) find /api/oauth/* on their own.
function unauthorized(req: ApiKeyRequest, res: Response, message: string) {
  const base = (process.env.CORS_ORIGIN || 'http://localhost').split(',')[0].trim();
  res.setHeader('WWW-Authenticate', `Bearer resource_metadata="${base}/.well-known/oauth-protected-resource"`);
  return res.status(401).json({ error: message });
}

// Express middleware: resolve a non-revoked ApiKey OR OAuthToken from the Bearer
// token (both share the `vlx_` prefix family), attach workspaceId/scopes/apiKeyId
// to the request, bump lastUsedAt. 401 on any failure.
export async function apiKeyAuth(req: ApiKeyRequest, res: Response, next: NextFunction) {
  try {
    const hdr = req.headers.authorization || '';
    const token = hdr.startsWith('Bearer ') ? hdr.slice(7).trim() : '';
    if (!token || !token.startsWith('vlx_')) return unauthorized(req, res, 'missing or invalid API key');
    const tokenHash = hashApiKey(token);

    const key = await prisma.apiKey.findUnique({ where: { keyHash: tokenHash } });
    if (key && !key.revoked) {
      req.workspaceId = key.workspaceId;
      req.scopes = (key.scopes as string[]) || [];
      req.apiKeyId = key.id;
      await prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {});
      return next();
    }

    const oauth = await prisma.oAuthToken.findUnique({ where: { accessTokenHash: tokenHash } });
    if (oauth && !oauth.revoked && oauth.accessExpiresAt > new Date()) {
      req.workspaceId = oauth.workspaceId;
      req.scopes = (oauth.scopes as string[]) || [];
      req.apiKeyId = oauth.id;
      return next();
    }

    return unauthorized(req, res, 'invalid, expired or revoked token');
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
