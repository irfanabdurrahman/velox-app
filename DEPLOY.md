# Deploying Velox

Velox ships as three containers orchestrated by Docker Compose:

- **postgres** — PostgreSQL 16 (data persisted in a named volume)
- **server** — the Express + Prisma API (runs migrations + seeds on first boot)
- **web** — the built React app served by nginx, which also reverse-proxies `/api` → `server`

Because nginx serves the app and proxies the API on the **same origin**, there are no
cross-origin/CORS issues in the browser.

## Prerequisites (on the VPS)

- Docker Engine + the Docker Compose plugin
  ```bash
  docker --version && docker compose version
  ```
- Ports: `WEB_PORT` (default 80) reachable. Nothing else needs to be public.

## 1. Get the code

Clone the repo (or copy it) onto the VPS, then `cd` into it.

## 2. Configure environment

```bash
cp .env.example .env
```
Edit `.env` and set, at minimum:

| Variable | What to put |
|---|---|
| `POSTGRES_PASSWORD` | a strong random password |
| `JWT_ACCESS_SECRET` | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | `openssl rand -base64 48` (different value) |
| `CORS_ORIGIN` | your public URL, e.g. `https://velox.example.com` (or `http://SERVER_IP` for a quick test) |
| `COOKIE_SECURE` | default `true` (requires HTTPS in front). Set `false` **only** for a plain-HTTP smoke test |
| `SEED_ON_START` | default `false` = clean empty database (recommended for production). `true` seeds demo data **and 11 demo accounts** |
| `SEED_DEMO_PASSWORD` | if seeding demo data, override the shared demo-account password |
| `DEEPSEEK_API_KEY` | your DeepSeek API key (leave empty to disable AI features) |
| `WEB_PORT` | host port to publish (default `80`) |

> Secrets live only in this `.env` on the server. `.env` is git-ignored and never committed.

## 3. Launch

```bash
docker compose up -d --build
```

On first start the `server` container automatically runs `prisma migrate deploy`
(creates all tables). **The database starts EMPTY by default** — register the first
account from the login screen (it becomes OWNER of its own workspace and can create
workspaces/projects from there).

> Demo mode (evaluation only): set `SEED_ON_START=true` to load the sample
> manufacturing/DX portfolio. ⚠ This also creates **11 demo login accounts** sharing
> one password (default `demo`, override with `SEED_DEMO_PASSWORD`). Never enable this
> on an internet-facing production instance without changing that password.

Check status / logs:
```bash
docker compose ps
docker compose logs -f server
```

Open `http://SERVER_IP` (or your domain) and register your account. Password minimum
is 8 characters (enforced server-side).

## 4. Put HTTPS in front (recommended)

Cookies are `HttpOnly`; set `COOKIE_SECURE=true` once TLS terminates in front of the app.
Two common options:

- **Caddy** (automatic Let's Encrypt): point a reverse proxy at `web:80`.
- **Nginx/Traefik** on the host terminating TLS and proxying to `WEB_PORT`.

After enabling TLS, set `COOKIE_SECURE=true` and `CORS_ORIGIN=https://your-domain`, then
`docker compose up -d` to apply.

## Everyday operations

```bash
docker compose up -d --build     # deploy / redeploy after code changes
docker compose down              # stop (keeps the data volume)
docker compose logs -f server    # tail API logs
docker compose exec server npx prisma migrate deploy   # apply new migrations
docker compose exec server node dist/seed.js           # re-seed (overwrites sample data)
```

Backups: the database lives in the `pgdata` volume. Back it up with:
```bash
docker compose exec postgres pg_dump -U velox velox > velox-backup.sql
```

## Turning AI on/off

Set `DEEPSEEK_API_KEY` in `.env` and `docker compose up -d`. When the key is present the
server calls DeepSeek for the AI chat and natural-language task parsing; when empty, the app
falls back to its built-in offline behaviour so nothing breaks. You can point at any
OpenAI-compatible provider by changing `AI_BASE_URL` / `AI_MODEL`.

## Local (non-Docker) development

See `README-DEV.md` — run Postgres locally, `npm run install:all`, `migrate:deploy`, `seed`,
then `npm run dev` (API :4000 + web :5173).
