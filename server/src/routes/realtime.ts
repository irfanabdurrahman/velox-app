// B3 realtime support: Web Push subscription management, per-user notification
// preferences, and delivery-channel status / test. Email + push are gated on
// server config (see notify.ts); in-app notifications always work.
import type { Express } from 'express';
import { z } from 'zod';
import { nanoid } from 'nanoid';
import { Prisma } from '@prisma/client';
import { prisma, requireAuth, h, bad } from '../ctx.ts';
import { emailEnabled, pushEnabled, vapidPublicKey, sendPush } from '../notify.ts';

// Standard PushSubscription shape (extra fields e.g. expirationTime are kept).
const subscribeSchema = z.object({
  subscription: z
    .object({
      endpoint: z.string().url(),
      keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
    })
    .passthrough(),
});

const prefsSchema = z.object({
  digest: z.boolean().optional(),
  mentions: z.boolean().optional(),
  assignments: z.boolean().optional(),
  statusChanges: z.boolean().optional(),
});

export function registerRealtimeRoutes(app: Express) {
  // ---- Web Push -----------------------------------------------------------
  app.post('/api/push/subscribe', requireAuth, h(async (req, res) => {
    const p = subscribeSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error);
    await prisma.user.update({ where: { id: req.user!.id }, data: { pushSub: p.data.subscription as Prisma.InputJsonValue } });
    res.json({ ok: true });
  }));

  app.post('/api/push/unsubscribe', requireAuth, h(async (req, res) => {
    await prisma.user.update({ where: { id: req.user!.id }, data: { pushSub: Prisma.DbNull } });
    res.json({ ok: true });
  }));

  // Public: the VAPID public key is safe to expose and the client needs it to
  // build a subscription.
  app.get('/api/push/vapid', (_req, res) => res.json({ enabled: pushEnabled(), key: vapidPublicKey() }));

  // ---- Notification preferences ------------------------------------------
  app.get('/api/notif/prefs', requireAuth, h(async (req, res) => {
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { notifPrefs: true } });
    res.json((u?.notifPrefs as Record<string, unknown>) ?? {});
  }));

  app.patch('/api/notif/prefs', requireAuth, h(async (req, res) => {
    const p = prefsSchema.safeParse(req.body);
    if (!p.success) return bad(res, p.error);
    const u = await prisma.user.findUnique({ where: { id: req.user!.id }, select: { notifPrefs: true } });
    const merged = { ...((u?.notifPrefs as Record<string, unknown>) || {}), ...p.data };
    await prisma.user.update({ where: { id: req.user!.id }, data: { notifPrefs: merged as Prisma.InputJsonValue } });
    res.json(merged);
  }));

  // ---- Delivery test + channel status ------------------------------------
  app.post('/api/notif/test', requireAuth, h(async (req, res) => {
    const uid = req.user!.id;
    await prisma.notification.create({
      data: { id: `n_${nanoid(8)}`, userId: uid, kind: 'test', ic: '🔔', unread: true, whenTxt: 'just now', txt: 'This is a test notification from Velox', ord: -Math.floor(Date.now() / 1000) },
    });
    await sendPush(uid, 'Velox test', 'Push is working'); // no-op unless push is configured
    res.json({ inApp: true, push: pushEnabled() });
  }));

  app.get('/api/notif/channels/status', (_req, res) => res.json({ email: emailEnabled(), push: pushEnabled() }));
}
