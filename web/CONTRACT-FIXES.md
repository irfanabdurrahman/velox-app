# Velox audit-fix contract (READ FIRST, then CONTRACT.md for the basics)

A production audit confirmed defects across the UI. Core (server + store/api/App/useInteractions)
is ALREADY FIXED — do not edit those files. New/changed store contract you build against:

## New store fields (already implemented in src/store.ts — read-only for you)
- `s.myRoles: Record<wsId, 'OWNER'|'ADMIN'|'MANAGER'|'MEMBER'|'GUEST'|'EXEC_VIEWER'>` — the
  logged-in user's role per workspace. Current-workspace role: `s.myRoles[s.ws]`.
- `s.memberships: {userId, ws, role}[]` — roles of everyone in the user's workspaces.
- `s.workloadWeeks: string[]` — 8 real week labels ("Jul 6"…), derived from the live TODAY.
- `s.workload` — now REAL hours computed from task assignments (6h/workday), keyed by member id.
- `s.aiEnabled: boolean`.
- `TODAY` (from `../lib/dates`) is now DYNAMIC — comes from the server at bootstrap and tracks the
  real clock. NEVER hardcode 2026/July/`11`/`11.5`/"Jul 10" anywhere. Derive year/month via
  `dateOf(TODAY)` (exported from lib/dates: `dateOf(d)` → Date).
- `s.addTask(name, pid?, par?, due?, patch?)` — NEW optional 5th arg merges fields (e.g.
  `{a:'BS', pr:'high'}`) into the optimistic row AND the create call. Use it instead of
  addTask-then-updateTask. Semantics change: `due` now means the task is DUE that day (s=e=due).
- ids: addTask returns a TEMP id which is later reconciled to the server id automatically;
  `updateTask`/`deleteTask`/`openTask` transparently resolve it. Never assume id format.
- All store mutations now ROLL BACK on server rejection and show an error toast automatically —
  do not add your own `.catch(()=>{})` around store calls; DO surface failures for direct `api.*`
  calls you make yourself.
- `api.aiParse(text)` → POST /ai/parse-task (server-grounded NL parse, EN/ID) when `s.aiEnabled`.
- NEW endpoint: `POST /api/workspaces {name}` creates a real workspace (creator becomes OWNER).
  Call via `fetch`? No — use `api` if a method exists; otherwise add nothing to api.ts (frozen):
  use `apiCreateWorkspace` exported from '../api'? NOT present — instead call
  `api.createProject` for projects; for workspaces use the generic pattern below:
  ```ts
  import { getToken } from '../api';
  const r = await fetch('/api/workspaces', { method:'POST', credentials:'include',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${getToken()}` },
    body: JSON.stringify({ name }) });
  if (!r.ok) throw new Error((await r.json()).error || 'failed');
  const ws = await r.json(); // {id,name,color,ini,meta}
  ```
  After creating a workspace/projects, update the store: `s.set(st => ({ workspaces:[...st.workspaces, ws], ws: ws.id }))`.

## Hard rules
- Escape key now also closes the slide-over and cancels board/calendar/workload drags (global).
- Roles: hide/disable WRITE affordances when `s.myRoles[s.ws]` is 'GUEST' or 'EXEC_VIEWER'.
- No fabricated data presented as real (fake costs, fake activity logs, fake counts, fake
  invitations, hardcoded "Admin"/"3" badges). Real data or an honest empty state / "Demo" tag.
- No dead controls: every clickable thing must either work or be removed.
- Typecheck ONLY your files: `cd /home/claude/repo/web && npx tsc --noEmit 2>&1 | grep -E '<YourFiles>'`.
  Do NOT run `tsc -b`, dev servers, builds, or edit files outside your assignment.
