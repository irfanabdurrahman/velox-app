// OAuth 2.1 authorization server, scoped to letting remote MCP clients (Claude.ai
// Connectors, and anything else that speaks the MCP auth spec) obtain a Velox
// access token through real user login + consent — as an alternative to pasting
// a static API key. PKCE (S256) is mandatory; clients register themselves
// dynamically (RFC 7591) since there is no pre-shared client id for Claude.ai.
//
// Endpoints:
//   GET  /.well-known/oauth-authorization-server        → RFC 8414 metadata
//   GET  /.well-known/oauth-protected-resource[/api/mcp] → RFC 9728 metadata
//   POST /api/oauth/register                             → RFC 7591 dynamic client registration
//   GET|POST /api/oauth/authorize                        → browser login + consent
//   POST /api/oauth/token                                 → authorization_code / refresh_token grant
import type { Express } from 'express';
import express from 'express';
import rateLimit from 'express-rate-limit';
import { randomBytes, createHash } from 'node:crypto';
import { nanoid } from 'nanoid';
import { prisma } from '../prisma.ts';
import { verifyPassword, signOAuthPending, verifyOAuthPending } from '../auth.ts';
import { hashApiKey } from '../apikey.ts';

const SCOPES = ['projects:read', 'projects:write', 'tasks:read', 'tasks:write', 'reports:read', 'goals:read', 'goals:write'];
const CODE_TTL_MS = 5 * 60 * 1000;
const ACCESS_TTL_MS = 60 * 60 * 1000;
const REFRESH_TTL_MS = 90 * 24 * 60 * 60 * 1000;

const baseUrl = () => (process.env.CORS_ORIGIN || 'http://localhost').split(',')[0].trim();
const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, (c) => (({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[c]));
const b64url = (buf: Buffer) => buf.toString('base64url');

const page = (title: string, body: string) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} — Velox</title>
<style>
  body{font-family:Inter,system-ui,sans-serif;margin:0;background:#FAFAFA;color:#18181B;display:grid;place-items:center;min-height:100vh}
  .card{width:100%;max-width:380px;background:#fff;border:1px solid #E4E4E7;border-radius:14px;padding:28px 26px;margin:16px}
  h1{font-size:18px;margin:0 0 4px}
  .sub{color:#71717A;font-size:13px;margin-bottom:18px}
  label{display:block;font-size:12.5px;font-weight:600;color:#3F3F46;margin:14px 0 5px}
  input,select{width:100%;box-sizing:border-box;padding:9px 10px;border:1px solid #D4D4D8;border-radius:8px;font-size:14px}
  button{width:100%;margin-top:20px;padding:10px;border:0;border-radius:8px;background:#4F46E5;color:#fff;font-weight:600;font-size:14px;cursor:pointer}
  button:hover{background:#4338CA}
  .err{background:#FEF2F2;color:#B91C1C;border:1px solid #FECACA;border-radius:8px;padding:8px 10px;font-size:12.5px;margin-bottom:12px}
  .scopes{background:#FAFAFA;border:1px solid #E4E4E7;border-radius:8px;padding:10px 12px;margin-top:6px}
  .scopes div{font-size:13px;padding:3px 0}
  .app{font-weight:700}
  .ws-opt{display:flex;align-items:center;gap:10px;border:1px solid #D4D4D8;border-radius:8px;padding:11px 12px;margin-top:8px;font-size:14px;cursor:pointer}
  .ws-opt input{width:auto;margin:0}
  .ws-fixed{border:1px solid #D4D4D8;border-radius:8px;padding:11px 12px;margin-top:8px;font-size:14px;background:#FAFAFA}
</style></head><body><div class="card">${body}</div></body></html>`;

export function registerOAuthServer(app: Express) {
  const router = express.Router();
  router.use(express.urlencoded({ extended: false })); // OAuth bodies are form-encoded; JSON is already parsed upstream

  // helmet's default CSP sets `form-action 'self'`, which some browsers (Chrome)
  // enforce not just on the form's immediate target but on every redirect that
  // follows from submitting it. Our /authorize consent form is same-origin, but
  // the 302 it issues afterwards goes to the OAuth *client's* redirect_uri —
  // some other origin, by design. Without this override, clicking "Authorize"
  // gets silently blocked by the browser with no visible error.
  router.use('/authorize', (_req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; base-uri 'self'; object-src 'none'");
    next();
  });

  // ---- discovery (RFC 8414 / RFC 9728) ------------------------------------
  const authServerMetadata = () => ({
    issuer: baseUrl(),
    authorization_endpoint: `${baseUrl()}/api/oauth/authorize`,
    token_endpoint: `${baseUrl()}/api/oauth/token`,
    registration_endpoint: `${baseUrl()}/api/oauth/register`,
    scopes_supported: SCOPES,
    response_types_supported: ['code'],
    grant_types_supported: ['authorization_code', 'refresh_token'],
    code_challenge_methods_supported: ['S256'],
    token_endpoint_auth_methods_supported: ['none'],
  });
  const protectedResourceMetadata = () => ({
    resource: `${baseUrl()}/api/mcp`,
    authorization_servers: [baseUrl()],
    scopes_supported: SCOPES,
    bearer_methods_supported: ['header'],
  });
  app.get('/.well-known/oauth-authorization-server', (_req, res) => res.json(authServerMetadata()));
  app.get('/.well-known/oauth-protected-resource', (_req, res) => res.json(protectedResourceMetadata()));
  app.get('/.well-known/oauth-protected-resource/api/mcp', (_req, res) => res.json(protectedResourceMetadata()));

  // ---- dynamic client registration (RFC 7591) -----------------------------
  const registerLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false });
  router.post('/register', registerLimiter, async (req, res) => {
    const uris = req.body?.redirect_uris;
    if (!Array.isArray(uris) || !uris.length || !uris.every((u: any) => typeof u === 'string' && /^https?:\/\//.test(u))) {
      return res.status(400).json({ error: 'invalid_client_metadata', error_description: 'redirect_uris must be a non-empty array of http(s) URLs' });
    }
    const client = await prisma.oAuthClient.create({
      data: { clientName: typeof req.body?.client_name === 'string' ? req.body.client_name.slice(0, 120) : null, redirectUris: uris },
    });
    res.status(201).json({
      client_id: client.id,
      client_name: client.clientName,
      redirect_uris: uris,
      token_endpoint_auth_method: 'none', // public client — PKCE (S256) required instead of a client secret
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
    });
  });

  // ---- authorize: step 1 (login) + step 2 (consent) -----------------------
  const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, standardHeaders: true, legacyHeaders: false });

  type OAuthParams = { client_id: string; redirect_uri: string; state: string; scope: string; code_challenge: string };

  async function validRedirect(clientId: string, redirectUri: string) {
    const client = await prisma.oAuthClient.findUnique({ where: { id: clientId } });
    if (!client) return null;
    const uris = (client.redirectUris as string[]) || [];
    if (!uris.includes(redirectUri)) return null;
    return client;
  }

  function loginForm(p: OAuthParams, error?: string) {
    return page('Sign in', `
      <h1>Sign in to Velox</h1>
      <div class="sub">to connect this app with your workspace</div>
      ${error ? `<div class="err">${esc(error)}</div>` : ''}
      <form method="post" action="/api/oauth/authorize">
        <input type="hidden" name="step" value="login">
        <input type="hidden" name="client_id" value="${esc(p.client_id)}">
        <input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri)}">
        <input type="hidden" name="state" value="${esc(p.state)}">
        <input type="hidden" name="scope" value="${esc(p.scope)}">
        <input type="hidden" name="code_challenge" value="${esc(p.code_challenge)}">
        <label>Email</label><input type="email" name="email" required autofocus>
        <label>Password</label><input type="password" name="password" required>
        <button type="submit">Continue</button>
      </form>`);
  }

  async function consentForm(p: OAuthParams, pending: string, scopes: string[]) {
    const uid = verifyOAuthPending(pending);
    const memberships = await prisma.membership.findMany({ where: { userId: uid }, include: { workspace: true } });
    // Radio buttons instead of a native <select> — some embedded webviews (incl.
    // the one Claude.ai's connector setup opens) render OS dropdown overlays
    // unreliably. A single workspace needs no picker at all — auto-select it.
    const workspacePicker = memberships.length <= 1
      ? `<div class="ws-fixed">${esc(memberships[0]?.workspace.name || 'Personal')}</div>
         <input type="hidden" name="workspaceId" value="${esc(memberships[0]?.workspaceId || '')}">`
      : memberships.map((m, i) => `
         <label class="ws-opt">
           <input type="radio" name="workspaceId" value="${esc(m.workspaceId)}" ${i === 0 ? 'checked' : ''} required>
           ${esc(m.workspace.name)}
         </label>`).join('');
    return page('Authorize', `
      <h1>Authorize access</h1>
      <div class="sub">An external app wants to access your Velox workspace</div>
      <form method="post" action="/api/oauth/authorize">
        <input type="hidden" name="step" value="consent">
        <input type="hidden" name="pending" value="${esc(pending)}">
        <input type="hidden" name="client_id" value="${esc(p.client_id)}">
        <input type="hidden" name="redirect_uri" value="${esc(p.redirect_uri)}">
        <input type="hidden" name="state" value="${esc(p.state)}">
        <input type="hidden" name="scope" value="${esc(p.scope)}">
        <input type="hidden" name="code_challenge" value="${esc(p.code_challenge)}">
        <label>Workspace</label>
        ${workspacePicker}
        <label>This app will be able to</label>
        <div class="scopes">${scopes.map((s) => `<div>• ${esc(s)}</div>`).join('')}</div>
        <button type="submit">Authorize</button>
      </form>`);
  }

  router.get('/authorize', async (req, res) => {
    const q = req.query as Record<string, string>;
    if (q.response_type !== 'code') return res.status(400).send(page('Error', '<h1>Unsupported response_type</h1><div class="sub">Only "code" is supported.</div>'));
    if (q.code_challenge_method && q.code_challenge_method !== 'S256') return res.status(400).send(page('Error', '<h1>Unsupported PKCE method</h1><div class="sub">Only S256 is supported.</div>'));
    if (!q.code_challenge) return res.status(400).send(page('Error', '<h1>Missing code_challenge</h1><div class="sub">PKCE is required.</div>'));
    const client = await validRedirect(q.client_id, q.redirect_uri || '');
    if (!client) return res.status(400).send(page('Error', '<h1>Unknown client or redirect_uri</h1><div class="sub">This connector is not registered, or its redirect URL does not match.</div>'));
    const p: OAuthParams = { client_id: q.client_id, redirect_uri: q.redirect_uri, state: q.state || '', scope: q.scope || '', code_challenge: q.code_challenge };
    res.send(loginForm(p));
  });

  router.post('/authorize', loginLimiter, async (req, res) => {
    const b = req.body as Record<string, string>;
    const p: OAuthParams = { client_id: b.client_id, redirect_uri: b.redirect_uri, state: b.state || '', scope: b.scope || '', code_challenge: b.code_challenge };
    const client = await validRedirect(p.client_id, p.redirect_uri || '');
    if (!client) return res.status(400).send(page('Error', '<h1>Unknown client or redirect_uri</h1>'));

    if (b.step === 'login') {
      const user = await prisma.user.findUnique({ where: { email: (b.email || '').toLowerCase() } });
      const ok = user ? await verifyPassword(user.passwordHash, b.password || '') : false;
      if (!user || !ok) return res.status(401).send(loginForm(p, 'Invalid email or password.'));
      const pending = signOAuthPending(user.id);
      const requested = (p.scope ? p.scope.split(' ') : SCOPES).filter((s) => SCOPES.includes(s));
      return res.send(await consentForm(p, pending, requested.length ? requested : SCOPES));
    }

    if (b.step === 'consent') {
      let uid: string;
      try { uid = verifyOAuthPending(b.pending); } catch { return res.status(401).send(loginForm(p, 'Your session expired — please sign in again.')); }
      const member = await prisma.membership.findUnique({ where: { userId_workspaceId: { userId: uid, workspaceId: b.workspaceId } } });
      if (!member) return res.status(403).send(page('Error', '<h1>Not a member of that workspace</h1>'));
      const requested = (p.scope ? p.scope.split(' ') : SCOPES).filter((s) => SCOPES.includes(s));
      const code = 'oac_' + nanoid(32);
      await prisma.oAuthCode.create({
        data: {
          code, clientId: client.id, userId: uid, workspaceId: b.workspaceId,
          scopes: requested.length ? requested : SCOPES, redirectUri: p.redirect_uri,
          codeChallenge: p.code_challenge, expiresAt: new Date(Date.now() + CODE_TTL_MS),
        },
      });
      const url = new URL(p.redirect_uri);
      url.searchParams.set('code', code);
      if (p.state) url.searchParams.set('state', p.state);
      return res.redirect(url.toString());
    }

    return res.status(400).send(page('Error', '<h1>Invalid request</h1>'));
  });

  // ---- token endpoint ------------------------------------------------------
  const tokenLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 60, standardHeaders: true, legacyHeaders: false });
  const mintTokenPair = () => ({ access: 'vlx_oat_' + b64url(randomBytes(24)), refresh: 'vlx_ort_' + b64url(randomBytes(24)) });

  router.post('/token', tokenLimiter, async (req, res) => {
    const b = req.body as Record<string, string>;

    if (b.grant_type === 'authorization_code') {
      const rec = await prisma.oAuthCode.findUnique({ where: { code: b.code || '' } });
      if (!rec || rec.used || rec.expiresAt < new Date()) return res.status(400).json({ error: 'invalid_grant' });
      if (rec.clientId !== b.client_id || rec.redirectUri !== b.redirect_uri) return res.status(400).json({ error: 'invalid_grant' });
      const challenge = b64url(createHash('sha256').update(b.code_verifier || '').digest());
      if (!b.code_verifier || challenge !== rec.codeChallenge) return res.status(400).json({ error: 'invalid_grant', error_description: 'PKCE verification failed' });
      await prisma.oAuthCode.update({ where: { code: rec.code }, data: { used: true } });
      const { access, refresh } = mintTokenPair();
      await prisma.oAuthToken.create({
        data: {
          accessTokenHash: hashApiKey(access), refreshTokenHash: hashApiKey(refresh),
          clientId: rec.clientId, userId: rec.userId, workspaceId: rec.workspaceId, scopes: rec.scopes as any,
          accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      });
      return res.json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: (rec.scopes as string[]).join(' ') });
    }

    if (b.grant_type === 'refresh_token') {
      const hash = hashApiKey(b.refresh_token || '');
      const rec = await prisma.oAuthToken.findUnique({ where: { refreshTokenHash: hash } });
      if (!rec || rec.revoked || !rec.refreshExpiresAt || rec.refreshExpiresAt < new Date()) return res.status(400).json({ error: 'invalid_grant' });
      await prisma.oAuthToken.update({ where: { id: rec.id }, data: { revoked: true } });
      const { access, refresh } = mintTokenPair();
      await prisma.oAuthToken.create({
        data: {
          accessTokenHash: hashApiKey(access), refreshTokenHash: hashApiKey(refresh),
          clientId: rec.clientId, userId: rec.userId, workspaceId: rec.workspaceId, scopes: rec.scopes as any,
          accessExpiresAt: new Date(Date.now() + ACCESS_TTL_MS), refreshExpiresAt: new Date(Date.now() + REFRESH_TTL_MS),
        },
      });
      return res.json({ access_token: access, token_type: 'Bearer', expires_in: ACCESS_TTL_MS / 1000, refresh_token: refresh, scope: (rec.scopes as string[]).join(' ') });
    }

    res.status(400).json({ error: 'unsupported_grant_type' });
  });

  app.use('/api/oauth', router);
}
