# Wave-6 frontend contract (production feature completion)

Read CONTRACT.md + CONTRACT-FIXES.md first for basics (Hover, ui.tsx, stMeta/prMeta, dates,
role gating via `s.myRoles[s.ws]`, no fabricated data, no dead controls, roll back nothing —
store mutators already roll back + toast on failure).

## FROZEN (import, never edit): store.ts, api.ts, types.ts, theme.css, lib/*, hooks/*,
## components/Hover.tsx, components/ui.tsx, components/CellMenu.tsx, components/Toasts.tsx, App.tsx, main.tsx.

## New store data (read from `useStore()`)
- `s.sections: {id,pid,name,ord}[]`, `s.customFields: {id,pid,name,kind,config,ord}[]`,
  `s.statusUpdates: {id,pid,author,status,summary,when}[]`, `s.online: Record<wsId, userId[]>` (presence).
- Task now has: `descr, checklist:{id,txt,done}[], cf:Record<fieldId,any>, sectionId, recurrence,
  a2:string[] (multi-assignee), watchers:string[], homes:string[]`. `deps` items now `{t,type?:'FS'|'SS'|'FF'|'SF',lag?,crit?}`.
- `s.applyLive` is called automatically by the realtime hook — do not call it.

## New api methods (all on `import { api } from '../api'`; they throw on error — catch + toast)
Data ops: `api.trash()`, `restoreTask(id)`, `purgeTask(id)`, `duplicateTask(id)`, `convertTask(id,parentId)`,
`bulkTasks(ids,patch,del?)`, `linkHome(id,pid)`, `unlinkHome(id,pid)`, `logTime(id,minutes,day,note?)`,
`taskTime(id)`, `reactComment(id,emoji)`, `taskComments(id)`,
`addSection(pid,name)`, `patchSection(id,patch)`, `delSection(id)`, `addField(pid,{name,kind,config})`, `delField(id)`,
`postStatus(pid,status,summary)`, `patchProject(pid,patch)`, `duplicateProject(pid,name?)`,
`uploadFile(taskId,File)`, `addLink(taskId,url,name)`, `delFile(id)`.
Integrations: `listApiKeys(ws)`, `createApiKey(ws,name,scopes[])` (returns {key} ONCE), `revokeApiKey(id)`,
`listWebhooks(ws)`, `createWebhook(ws,url,events[])`, `patchWebhook(id,patch)`, `delWebhook(id)`, `testWebhook(id)`,
`eventCatalog()`, `listRules(ws)/createRule/patchRule/delRule`, `listForms(ws)/createForm/delForm`, `mcpManifest()`.
Reports: `reportBurndown(pid)`, `reportVelocity(ws)`, `reportCfd(pid)`, `reportTimesheet(ws,from,to)`, `reportPortfolio(ws)`, `scheduleReport(ws,cadence,email)`.
AI: `api.aiRisk()` → `{rows:[{project,probability,causes[],recommendation}], source:'ai'|'heuristic'}`.
Auth-x/realtime: `ssoStatus()`→{google,microsoft}, `twoFASetup()`→{otpauthUrl,qrDataUrl}, `twoFAEnable(token)`, `twoFADisable(token)`,
`exportWs(ws)`, `auditLog(ws)`, `pushVapid()`→{enabled,key}, `pushSubscribe(sub)`, `notifPrefs()`, `setNotifPrefs(p)`, `notifChannels()`→{email,push}.

## i18n
`import { t, setLang, getLang, useLang } from '../lib/i18n'`. Use `useLang()` in a component to
re-render on language change; `t('nav.home')` etc. (keys in i18n.ts — add keys there ONLY if your
screen needs them; that file is editable by the shell/nav agent only — others: use t() with existing keys or literal copy).

## Rules
- Fetch integration/report data with local `useState`+`useEffect` (not the store). Show loading + empty states.
- Role-gate writes: hide create/delete when `['GUEST','EXEC_VIEWER'].includes(s.myRoles[s.ws])`.
- API keys: show the full key ONCE in a copyable box after creation, then only the prefix.
- Typecheck ONLY your files: `cd /home/claude/repo/web && npx tsc --noEmit 2>&1 | grep -E '<yourfiles>'` empty. No dev server.
