import type { Express } from 'express';
import { registerTaskRoutes } from './tasks.ts';
import { registerProjectRoutes } from './projects.ts';
import { registerUploadRoutes } from './uploads.ts';
import { registerIntegrationRoutes } from './integrations.ts';
import { registerPublicApi } from './publicApi.ts';
import { registerMcp } from './mcp.ts';
import { registerOAuthServer } from './oauthServer.ts';
import { registerCategoryRoutes } from './categories.ts';
import { registerReportRoutes } from './reports.ts';
import { registerAuthxRoutes } from './authx.ts';
import { registerRealtimeRoutes } from './realtime.ts';
import { registerGoalRoutes } from './goals.ts';

export function mountRoutes(app: Express) {
  registerTaskRoutes(app);      // Wave 1: trash/restore, duplicate, convert, bulk, time, assignees, watchers, multi-home
  registerProjectRoutes(app);   // Wave 1: sections, custom fields, status updates, templates, privacy, archive
  registerUploadRoutes(app);    // Wave 1: attachment upload + download
  registerIntegrationRoutes(app); // Wave 2: api keys, webhooks, rules, forms
  registerPublicApi(app);       // Wave 2: REST API authenticated by API key + scopes
  registerMcp(app);             // Wave 2: MCP server (tools over HTTP)
  registerOAuthServer(app);     // Wave 8: OAuth 2.1 authorization server for remote MCP connectors
  registerCategoryRoutes(app);  // Wave 9: workspace-scoped, user-managed project categories
  registerReportRoutes(app);    // Wave 5: burndown, velocity, cfd, timesheet
  registerAuthxRoutes(app);     // Wave 4: 2FA, SSO, data export, audit log
  registerRealtimeRoutes(app);  // Wave 3: push subscribe, notif prefs, digest test
  registerGoalRoutes(app);      // Wave 7: DB-backed goals / OKRs
}
