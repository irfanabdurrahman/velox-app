# Velox

A modern project-management web app — **Velox** (Latin for "swift"). This is the real
implementation of the Claude Design prototype in `project/Velox App.dc.html`.

Positioning: more capable than Trello, dramatically simpler than Microsoft Project — the
speed/keyboard polish of Linear, the friendliness of Asana, an Excel-familiar Gantt as the
hero, and built-in agentic AI.

## Stack

- **web/** — React 18 + Vite + TypeScript SPA. State in Zustand (`src/store.ts`).
  Theme system (8 accents × light/dark/system) in `src/theme.css`.
- **server/** — Express + **PostgreSQL** (via **Prisma**) REST API. Production-grade auth:
  **argon2** password hashing, JWT **access + rotating refresh tokens** (httpOnly cookie),
  **per-workspace RBAC** (Owner/Admin/Manager/Member/Guest/Executive-Viewer), **zod** input
  validation, **helmet**, **rate limiting**, strict CORS. Seeded from the prototype's realistic
  manufacturing/DX sample data (`src/data.ts`, `src/seed.ts`).

## Run it

Prereq: a running PostgreSQL. Then:

```bash
cp server/.env.example server/.env     # set DATABASE_URL + JWT secrets
npm run install:all                    # install root + server + web deps
npm --prefix server run migrate:deploy # apply DB migrations
npm run seed                           # seed sample data
npm run dev                            # API (:4000) + web (:5173)
```

Then open http://localhost:5173. The Vite dev server proxies `/api` → `:4000`.

**Login (dev):** after `npm run seed`, every seeded team member is a real account
(password `demo`) — e.g. `budi.s@company.co.id` (Owner/Admin). Self-registration works too
(min 8-char password). Roles are enforced server-side: Guest/Executive-Viewer are read-only;
a Member can edit but not delete; Manager+ can delete; each user only sees the workspaces
they belong to, and DMs are private to their participants. In production the demo seed is
**opt-in** (`SEED_ON_START`, see DEPLOY.md).

- Migrations: `npm --prefix server run migrate:dev` (create), `migrate:deploy` (apply)
- Reseed: `npm run seed`
- Production build: `npm run build`

## Layout

```
web/src
  App.tsx              app shell (auth gate, sidebar, topbar, screen router, overlays)
  store.ts             single Zustand store (data + UI state + actions)
  theme.css            CSS-variable theme system (light/dark + 8 accents)
  lib/                 dates, status/priority meta, Gantt geometry, refs
  hooks/               global pointer/keyboard interactions (drag, ⌘K)
  components/          Sidebar, Topbar, SlideOver, AiPanel, CommandPalette,
                       QuickAdd, Onboarding, CellMenu, Toasts, Hover, ui
  screens/             Login, Home (exec dashboard), ProjectScreen, MyTasks, Inbox,
                       Chat, Goals, AiPage, Settings, Admin, Present
  screens/gantt/       the hero Gantt (grid + timeline + drag/deps/critical path)
  screens/views/       List, Board, Calendar, Workload, ProjectDashboard
server/src
  data.ts  db.ts  seed.ts  index.ts   (schema, seed, REST API, auth)
```

## Notes on data model

Dates are stored as **day-indices** relative to an epoch (Mon 29 Jun 2026), exactly like the
prototype, so the Gantt math is identical. Today is day 11 (Fri 10 Jul 2026). The seed spans
July–December 2026 with several overdue/at-risk items so the red/amber states are visible.
