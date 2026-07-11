// B4 governance: two-factor auth (TOTP), SSO (Google/Microsoft), workspace data
// export, and the audit log. Login-time 2FA challenge lives in the (frozen) login
// route — here we only manage the enrolment + expose management endpoints.
import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { randomBytes } from 'node:crypto';
import { generateSecret, generateURI, verify as verifyTotp } from 'otplib';
import QRCode from 'qrcode';
import { prisma, requireAuth, h, bad, HttpError, assertCan } from '../ctx.ts';
import { issueRefresh, refreshCookieOpts } from '../auth.ts';
import {
  googleEnabled, microsoftEnabled, providerEnabled, authorizeUrl, exchangeCode, type Provider,
} from '../oauth.ts';

// Write an audit row without blocking the request path. Exported so other modules
// (member role changes, api-key rotation, …) can record governance events.
export function logAudit(workspaceId: string, actorId: string | null, action: string, target?: string, meta?: unknown) {
  prisma.auditLog
    .create({ data: { workspaceId, actorId: actorId ?? null, action, target: target ?? null, meta: (meta ?? {}) as any } })
    .catch(() => {});
}

// One authenticator step (30s) of drift tolerance in each direction.
const verify2FA = (secret: string, token: string) => verifyTotp({ secret, token, epochTolerance: 30 });

const tokenSchema = z.object({ token: z.string().regex(/^\d{6}$/, 'expected a 6-digit code') });

export function registerAuthxRoutes(app: Express) {
  // ---- 2FA (TOTP) ---------------------------------------------------------
  // Begin enrolment: mint a secret, persist it but keep 2FA OFF until a code proves
  // the user has it in their authenticator.
  app.post('/api/2fa/setup', requireAuth, h(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user) throw new HttpError(404, 'user not found');
    const secret = generateSecret();
    await prisma.user.update({ where: { id: user.id }, data: { twoFASecret: secret, twoFAEnabled: false } });
    const otpauthUrl = generateURI({ issuer: 'Velox', label: user.email, secret });
    const qrDataUrl = await QRCode.toDataURL(otpauthUrl);
    res.json({ otpauthUrl, qrDataUrl });
  }));

  app.post('/api/2fa/enable', requireAuth, h(async (req, res) => {
    const p = tokenSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.twoFASecret) throw new HttpError(400, '2FA setup has not been started');
    if (!(await verify2FA(user.twoFASecret, p.data.token)).valid) throw new HttpError(400, 'invalid code');
    await prisma.user.update({ where: { id: user.id }, data: { twoFAEnabled: true } });
    res.json({ ok: true });
  }));

  app.post('/api/2fa/disable', requireAuth, h(async (req, res) => {
    const p = tokenSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.twoFASecret) throw new HttpError(400, '2FA is not enabled');
    if (!(await verify2FA(user.twoFASecret, p.data.token)).valid) throw new HttpError(400, 'invalid code');
    await prisma.user.update({ where: { id: user.id }, data: { twoFAEnabled: false, twoFASecret: null } });
    res.json({ ok: true });
  }));

  // Stateless code check for a future login-time 2FA gate. Never throws on a bad
  // code — returns {valid:false} so callers can branch.
  app.post('/api/2fa/verify', requireAuth, h(async (req, res) => {
    const p = tokenSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error);
    const user = await prisma.user.findUnique({ where: { id: req.user!.id } });
    if (!user?.twoFASecret) return res.json({ valid: false });
    res.json({ valid: (await verify2FA(user.twoFASecret, p.data.token)).valid });
  }));

  // ---- SSO (Google + Microsoft) ------------------------------------------
  // Public: lets the login screen decide which buttons to render.
  app.get('/api/auth/sso/status', (_req, res) => res.json({ google: googleEnabled(), microsoft: microsoftEnabled() }));

  const stateCookieOpts = {
    httpOnly: true as const,
    sameSite: 'lax' as const,
    secure: refreshCookieOpts.secure,
    path: '/api/auth',
    maxAge: 10 * 60 * 1000,
  };
  const webOrigin = () => process.env.WEB_ORIGIN || 'http://localhost:5173';

  const ssoStart = (provider: Provider) => h(async (req, res) => {
    if (!providerEnabled(provider)) throw new HttpError(400, 'SSO not configured');
    const state = randomBytes(16).toString('base64url');
    res.cookie('velox_oauth_state', state, stateCookieOpts);
    res.redirect(authorizeUrl(provider, state));
  });
  app.get('/api/auth/google', ssoStart('google'));
  app.get('/api/auth/microsoft', ssoStart('microsoft'));

  const ssoCallback = (provider: Provider) => h(async (req, res) => {
    const fail = () => res.redirect(`${webOrigin()}/?sso=error`);
    res.clearCookie('velox_oauth_state', { ...stateCookieOpts, maxAge: undefined });
    try {
      if (!providerEnabled(provider)) return fail();
      const code = typeof req.query.code === 'string' ? req.query.code : '';
      const state = typeof req.query.state === 'string' ? req.query.state : '';
      const expected = req.cookies?.velox_oauth_state;
      if (!code || !state || !expected || state !== expected) return fail();

      const profile = await exchangeCode(provider, code);
      if (!profile.email) return fail();

      let user = await prisma.user.findUnique({ where: { email: profile.email } });
      if (!user) {
        // First SSO login mirrors the register flow: create the account + a
        // Personal workspace they own. No usable password (SSO-only account).
        const name = profile.name || profile.email.split('@')[0];
        const initials = name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase() || 'U';
        user = await prisma.user.create({
          data: {
            id: nanoid(10), email: profile.email, name, passwordHash: '', initials, color: '#6366F1',
            isRegistered: true, oauthProvider: provider, oauthId: profile.sub,
          },
        });
        const wsId = `ws_${nanoid(6)}`;
        await prisma.workspace.create({ data: { id: wsId, name: 'Personal', color: '#64748B', ini: 'P', meta: '0 projects' } });
        await prisma.membership.create({ data: { userId: user.id, workspaceId: wsId, role: 'OWNER' } });
      } else if (!user.oauthProvider) {
        user = await prisma.user.update({ where: { id: user.id }, data: { oauthProvider: provider, oauthId: profile.sub } });
      }

      // Issue only the refresh cookie; the SPA calls /auth/refresh on load to
      // mint an access token from it.
      const { raw } = await issueRefresh(user.id);
      res.cookie('velox_rt', raw, refreshCookieOpts);
      res.redirect(`${webOrigin()}/?sso=ok`);
    } catch {
      return fail();
    }
  });
  app.get('/api/auth/google/callback', ssoCallback('google'));
  app.get('/api/auth/microsoft/callback', ssoCallback('microsoft'));

  // ---- Data export --------------------------------------------------------
  app.get('/api/ws/:wsId/export', requireAuth, h(async (req, res) => {
    const wsId = req.params.wsId;
    await assertCan(req.user!.id, wsId, 'MANAGER');
    const projScope = { project: { workspaceId: wsId } };
    const [workspace, projects, tasks, sections, customFields, members, statusUpdates] = await Promise.all([
      prisma.workspace.findUnique({ where: { id: wsId } }),
      prisma.project.findMany({ where: { workspaceId: wsId } }),
      prisma.task.findMany({ where: { ...projScope, deletedAt: null } }),
      prisma.section.findMany({ where: projScope }),
      prisma.customField.findMany({ where: projScope }),
      prisma.membership.findMany({
        where: { workspaceId: wsId },
        select: { userId: true, role: true, user: { select: { id: true, name: true, email: true } } },
      }),
      prisma.statusUpdate.findMany({ where: projScope }),
    ]);
    logAudit(wsId, req.user!.id, 'workspace.exported', wsId, { projects: projects.length, tasks: tasks.length });
    res.setHeader('Content-Disposition', 'attachment; filename="velox-export.json"');
    res.json({
      exportedAt: new Date().toISOString(),
      workspace,
      projects,
      tasks,
      sections,
      customFields,
      members: members.map((m) => ({ id: m.userId, name: m.user?.name, email: m.user?.email, role: m.role })),
      statusUpdates,
    });
  }));

  // ---- Audit log ----------------------------------------------------------
  app.get('/api/ws/:wsId/audit', requireAuth, h(async (req, res) => {
    await assertCan(req.user!.id, req.params.wsId, 'MANAGER');
    const rows = await prisma.auditLog.findMany({
      where: { workspaceId: req.params.wsId },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    res.json(rows.map((r) => ({ action: r.action, actor: r.actorId, target: r.target, meta: r.meta, createdAt: r.createdAt })));
  }));
}
