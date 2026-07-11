import { hash, verify } from '@node-rs/argon2';
import jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
import { prisma } from './prisma.ts';

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-me';
const ACCESS_TTL = Number(process.env.ACCESS_TTL || 900); // seconds
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS || 30);
const ARGON = { memoryCost: 19456, timeCost: 2, parallelism: 1 };

export const hashPassword = (pw: string) => hash(pw, ARGON);
export const verifyPassword = (hashStr: string, pw: string) => verify(hashStr, pw, ARGON).catch(() => false);

export function signAccess(user: { id: string; email: string }) {
  return jwt.sign({ sub: user.id, email: user.email }, ACCESS_SECRET, { expiresIn: ACCESS_TTL });
}

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

// Opaque refresh token, stored only as a hash. Returned raw to the client cookie.
export async function issueRefresh(userId: string) {
  const raw = randomBytes(48).toString('base64url');
  const expiresAt = new Date(Date.now() + REFRESH_TTL_DAYS * 864e5);
  await prisma.refreshToken.create({ data: { userId, tokenHash: sha256(raw), expiresAt } });
  return { raw, expiresAt };
}

// Rotation with a short multi-tab grace window and token-family theft detection:
// a token that was rotated >GRACE ago being replayed means it was stolen — revoke
// every session for that user and force re-authentication.
const ROTATE_GRACE_MS = 30_000;

export async function rotateRefresh(raw: string) {
  const rec = await prisma.refreshToken.findUnique({ where: { tokenHash: sha256(raw) } });
  if (!rec || rec.expiresAt < new Date()) throw new Error('invalid refresh token');
  if (rec.revoked) {
    const withinGrace = rec.rotatedAt && Date.now() - rec.rotatedAt.getTime() < ROTATE_GRACE_MS;
    if (!withinGrace) {
      // replay of an old token outside the grace window → kill the whole family
      await prisma.refreshToken.updateMany({ where: { userId: rec.userId }, data: { revoked: true } });
      throw new Error('refresh token reuse detected');
    }
    // concurrent tab refreshed a moment ago — allow one more rotation from this token
  } else {
    await prisma.refreshToken.update({ where: { id: rec.id }, data: { revoked: true, rotatedAt: new Date() } });
  }
  const user = await prisma.user.findUnique({ where: { id: rec.userId } });
  if (!user) throw new Error('user gone');
  const next = await issueRefresh(user.id);
  return { user, access: signAccess(user), refresh: next.raw };
}

export async function revokeRefresh(raw: string | undefined) {
  if (!raw) return;
  await prisma.refreshToken.updateMany({ where: { tokenHash: sha256(raw) }, data: { revoked: true } });
}

export interface AuthedRequest extends Request {
  user?: { id: string; email: string };
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'unauthenticated' });
  try {
    const payload = jwt.verify(token, ACCESS_SECRET) as any;
    req.user = { id: payload.sub, email: payload.email };
    next();
  } catch {
    res.status(401).json({ error: 'invalid or expired token' });
  }
}

// COOKIE_SECURE forces the Secure flag on/off independent of NODE_ENV — set it to
// "false" when first deploying over plain HTTP, "true" once TLS is in front.
const cookieSecure = process.env.COOKIE_SECURE
  ? process.env.COOKIE_SECURE === 'true'
  : process.env.NODE_ENV === 'production';

export const refreshCookieOpts = {
  httpOnly: true as const,
  sameSite: 'lax' as const,
  secure: cookieSecure,
  path: '/api/auth',
  maxAge: REFRESH_TTL_DAYS * 864e5,
};
