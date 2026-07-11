// OAuth2 (Google + Microsoft) helpers. Everything is gated on configuration:
// no provider is offered — and no external network call is ever made — unless the
// relevant client id + secret are present in the environment. Client secrets stay
// server-side and are never returned to the browser.

export type Provider = 'google' | 'microsoft';

export type OAuthProfile = { email: string; name: string; sub: string };

export const googleEnabled = () => !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
export const microsoftEnabled = () => !!(process.env.MS_CLIENT_ID && process.env.MS_CLIENT_SECRET);
export const providerEnabled = (p: Provider) => (p === 'google' ? googleEnabled() : microsoftEnabled());

const redirectBase = () => process.env.OAUTH_REDIRECT_BASE || 'http://localhost:4000';
const redirectUri = (p: Provider) => `${redirectBase()}/api/auth/${p}/callback`;

type ProviderConfig = {
  authUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scope: string;
  clientId: () => string;
  clientSecret: () => string;
};

const PROVIDERS: Record<Provider, ProviderConfig> = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userInfoUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    clientId: () => process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: () => process.env.GOOGLE_CLIENT_SECRET || '',
  },
  microsoft: {
    authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
    tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
    userInfoUrl: 'https://graph.microsoft.com/oidc/userinfo',
    scope: 'openid email profile',
    clientId: () => process.env.MS_CLIENT_ID || '',
    clientSecret: () => process.env.MS_CLIENT_SECRET || '',
  },
};

// Build the provider's authorize URL (302 target). `state` is an opaque
// anti-CSRF nonce the caller must echo-check on the callback.
export function authorizeUrl(provider: Provider, state: string): string {
  const cfg = PROVIDERS[provider];
  const params = new URLSearchParams({
    client_id: cfg.clientId(),
    redirect_uri: redirectUri(provider),
    response_type: 'code',
    scope: cfg.scope,
    state,
  });
  if (provider === 'google') {
    params.set('access_type', 'offline');
    params.set('prompt', 'select_account');
  } else {
    params.set('response_mode', 'query');
  }
  return `${cfg.authUrl}?${params.toString()}`;
}

// Exchange an authorization code for tokens, then fetch the user profile.
// Throws on any non-2xx or missing-field condition; callers redirect to ?sso=error.
export async function exchangeCode(provider: Provider, code: string): Promise<OAuthProfile> {
  const cfg = PROVIDERS[provider];
  const body = new URLSearchParams({
    client_id: cfg.clientId(),
    client_secret: cfg.clientSecret(),
    code,
    grant_type: 'authorization_code',
    redirect_uri: redirectUri(provider),
  });
  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body,
  });
  if (!tokenRes.ok) throw new Error(`token exchange failed (${tokenRes.status})`);
  const token = (await tokenRes.json()) as { access_token?: string };
  if (!token.access_token) throw new Error('no access token returned');

  const infoRes = await fetch(cfg.userInfoUrl, {
    headers: { Authorization: `Bearer ${token.access_token}`, Accept: 'application/json' },
  });
  if (!infoRes.ok) throw new Error(`userinfo failed (${infoRes.status})`);
  const info = (await infoRes.json()) as Record<string, unknown>;

  const email = String(info.email || info.preferred_username || info.upn || '').toLowerCase();
  const name = String(info.name || info.given_name || (email ? email.split('@')[0] : '') || '');
  const sub = String(info.sub || info.oid || info.id || '');
  return { email, name, sub };
}
