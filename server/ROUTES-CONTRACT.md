# Backend route-module contract

You implement ONE stub file under `server/src/routes/`. It exports a `register…(app: Express)`
function already imported by `routes/index.ts` — keep that export name. Add helper files under
`server/src/` if useful (import them from your route file only).

## Shared context (import from `../ctx.ts`)
```ts
import { prisma, requireAuth, h, bad, HttpError, assertCan, assertMember, roleIn,
         accessibleWorkspaceIds, workspaceOfProject, workspaceOfTask, todayIdx, EP } from '../ctx.ts';
```
- `h(async (req, res) => {...})` wraps a handler: throw `new HttpError(status, msg)` for errors; it maps to JSON.
- `bad(res, zodResult.error)` returns a 400 with details.
- `assertCan(userId, workspaceId, 'MEMBER'|'MANAGER'|'OWNER')` throws 403 if the user lacks that write level.
  `assertMember` just requires membership (read). GUEST/EXEC_VIEWER have write-rank 0.
- `req.user.id` is set by `requireAuth` middleware — put `requireAuth` before `h(...)`.
- `todayIdx()` = current day index from EP (Mon 2026-06-29). Dates are day indices.
- Emit domain events so realtime/webhooks fire: `import { emit } from '../events.ts'` then
  `emit(workspaceId, 'task.updated'|'status.changed'|..., payload, actorId)`.

## Prisma models you can use (already migrated)
User(id,email,name,initials,color,twoFAEnabled,twoFASecret,oauthProvider,oauthId,notifPrefs,pushSub),
Workspace, Membership(userId,workspaceId,role), Project(...,privacy,archived,isTemplate),
Task(...,descr,checklist,cf,sectionId,recurrence,ord,deletedAt), Section, CustomField, Comment(parentId),
FileAsset(url,bytes), TimeEntry, StatusUpdate, TaskAssignee, TaskWatcher, TaskProject,
ApiKey(workspaceId,name,prefix,keyHash,scopes[],lastUsedAt,revoked),
Webhook(workspaceId,url,events[],secret,active) + WebhookDelivery,
Rule(workspaceId,name,trigger,action,active), Form(workspaceId,projectId,name,fields[],active) + FormSubmission,
AuditLog(workspaceId,actorId,action,target,meta), Goal + KeyResult, RefreshToken, ChatChannel, Notification.

## Rules
- Every route MUST authorize (assertCan/assertMember) against the right workspace.
- Validate all input with zod.
- Only edit your assigned file(s). Do NOT edit index.ts, ctx.ts, events.ts, ws.ts, other route files,
  or the prisma schema (it's frozen — all models above already exist).
- Typecheck: `cd /home/claude/repo/server && npx tsc --noEmit 2>&1 | grep -E '<yourfile>'` must be empty.
  Do NOT run the dev server (another process owns port 4000).
