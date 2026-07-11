# Velox port — contract for screen components

You are porting ONE part of the Velox app from a Claude Design prototype into this
React + Vite + TS codebase. Match the prototype **pixel-for-pixel** (same inline styles,
same CSS variables, same layout, same interactions). Do NOT invent new visual design.

## Source of truth
The prototype is a single file: `/home/claude/repo/project/Velox App.dc.html`.
- The **template** (markup) uses `{{bindings}}`, `<sc-if value>`, `<sc-for list as>`.
- The **logic** is a `class Component extends DCLogic` starting near line 1628. View-model
  values (`{{...}}`) are computed in `core()` (~1841), `more()` (~2097, slide-over + cell menu
  + palette + quick-add), `more2()` (~2350, list/board/calendar/workload/project-dashboard/
  exec-dashboard/my-tasks/inbox/chat/goals/settings/admin), and `pres()` (~2759, present mode).
- Read the exact template line range AND the matching logic for your screen before writing.
- `this.setState({...})` → `useStore.getState().set({...})` or the store action. `this.members`,
  `this.projects`, `this.catDefs`, `this.wsDefs` are data; in our store they are
  `s.members`, `s.projects`, `s.categories`, `s.workspaces`.
- Dates are **day-indices** (integers). `this.fmt(d)` → `fmt(d)` from `src/lib/dates`. `this.TODAY`
  → `TODAY` (import from `src/lib/dates`). `this.EP` → `EP`.

## The store (FROZEN — read only, do not edit `src/store.ts` or `src/types.ts` or `src/theme.css`)
`import { useStore } from '../store'` (adjust relative path). Inside a component:
```ts
const s = useStore();           // whole store (re-renders on any change) — fine for screens
// data:  s.members (Record<id,{n,c,role,email}>), s.workspaces, s.categories,
//        s.projects (Project[]), s.tasks (Task[]), s.inbox (Notif[]),
//        s.chatChannels, s.chatMsgs (Record<chanId, ChatMsg[]>), s.workload (Record<memberId, number[8]>),
//        s.user ({id,name,email,initials,color}), s.comments/s.files (Record<taskId, ...>)
// selectors: s.task(id), s.proj(id), s.kids(id), s.desc(id), s.parProg(id)
// ui state (read + set via s.set): s.projectId, s.screen, s.view, s.density ('comf'|'comp'),
//   s.listSel, s.calMode, s.calM, s.dash {lvl,filter,pid,cat,owner}, s.inboxTab, s.chatChan,
//   s.chatInput, s.setTab, s.adminView, s.soId, s.soTab, s.soSubDraft, s.soComDraft,
//   s.aiMsgs, s.aiInput, s.aiBusy, s.pMsgs, s.pInput, s.pBusy, s.aiApplied, s.aiPanel,
//   s.qaText, s.qaPreview, s.palQ, s.palIdx, s.onb, s.present, s.bdrag, s.cdrag, s.wldrag
// mutators:
s.set({ field: value })                       // generic patch (also accepts (state)=>partial)
s.updateTask(id, patch, toastMsg?)            // optimistic + persists to backend
s.addTask(name, pid?, par?, dueDayIndex?)     // returns new id
s.deleteTask(id)
s.createProject(partial) -> Promise<Project>
s.openTask(id)                                 // opens slide-over
s.go(screen); s.setView(view); s.pushToast(txt, kind?)
s.markRead(id); s.markAllRead(); s.sendChat(chanId, txt, ref?)
```
For **purely local, ephemeral UI toggles** not already in the store, use React `useState` —
do NOT add fields to the store.

## Shared helpers & components (import, don't reinvent)
- `import { stMeta, prMeta, dotFor, stBar, MO, DW, ACCENTS, ACCENT_LABEL, ACCENT_SWATCH } from '../lib/meta'`
  - `stMeta(st)` -> `{l,b,t}` label/bg/text for statuses: done|prog|risk|bad|mut
  - `prMeta(pr)` -> `{c,t}` colour/label for urgent|high|med|low
- `import { fmt, TODAY, EP, dateOf, dowIdx } from '../lib/dates'`
- `import { Hover } from '../components/Hover'` — replicates the prototype's `style-hover`:
  `<Hover as="span" style={{...}} hover={{ background:'var(--hover)' }} onClick={...}>…</Hover>`
  (default tag is div). Use it wherever the prototype has `style-hover="..."`.
- `import { Avatar, StatusPill, PriorityFlag, ProgressBar, Icon } from '../components/ui'`
  - `<Avatar id="BS" size={24} />` renders initials chip in member colour (dashed + for null).

## Conventions
- Inline styles only, exactly like the prototype. Use the CSS vars (`var(--txt)`, `var(--acc)`,
  `var(--card)`, `var(--line)`, `var(--bg)`, `var(--panel)`, `var(--accS)`, `var(--accT)`,
  status vars `--okB/--okT/--inB/--inT/--waB/--waT/--bdB/--bdT/--muB/--muT`, etc.).
- Overlays that must not close on inner click: `onMouseDown={(e)=>e.stopPropagation()}`.
- SVGs: copy the exact `viewBox`/`path` from the prototype. `title=` on svg is allowed.
- Keep component names exactly as the file you were told to write (default export names matter
  because `App.tsx`/`ProjectScreen.tsx` already import them).
- The file must compile under strict TS. Prefer `const s = useStore();` then read fields.
  For dynamic drag state fields use `(s as any).bdrag` etc. if TS complains.

## Verify before finishing
Run `cd /home/claude/repo/web && npx tsc -b` — your files must not introduce type errors.
Do not start dev servers. Do not edit files outside your assignment.
