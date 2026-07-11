// Email + Web Push delivery. Both are gated on configuration: if SMTP/VAPID env
// vars are absent, these become safe no-ops (in-app notifications still work).
import nodemailer from 'nodemailer';
import webpush from 'web-push';
import { prisma } from './prisma.ts';
import { todayIdx } from './ctx.ts';

const smtpConfigured = () => !!(process.env.SMTP_HOST && process.env.SMTP_USER);
let transporter: nodemailer.Transporter | null = null;
function mailer() {
  if (!smtpConfigured()) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT || 587),
      secure: process.env.SMTP_SECURE === 'true',
      auth: { user: process.env.SMTP_USER!, pass: process.env.SMTP_PASS || '' },
    });
  }
  return transporter;
}

export const emailEnabled = () => smtpConfigured();

export async function sendEmail(to: string, subject: string, html: string) {
  const t = mailer();
  if (!t) return false;
  await t.sendMail({ from: process.env.SMTP_FROM || 'Velox <no-reply@velox.app>', to, subject, html });
  return true;
}

// ---- Web Push -------------------------------------------------------------
const pushConfigured = () => !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
if (pushConfigured()) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@velox.app',
    process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!,
  );
}
export const pushEnabled = () => pushConfigured();
export const vapidPublicKey = () => process.env.VAPID_PUBLIC_KEY || '';

export async function sendPush(userId: string, title: string, body: string) {
  if (!pushConfigured()) return false;
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { pushSub: true } });
  if (!u?.pushSub) return false;
  try {
    await webpush.sendNotification(u.pushSub as any, JSON.stringify({ title, body }));
    return true;
  } catch { return false; }
}

// ---- Digest ---------------------------------------------------------------
export async function sendDigest(_cadence: 'daily' | 'weekly') {
  if (!smtpConfigured()) return;
  const T = todayIdx();
  const users = await prisma.user.findMany({ where: { isRegistered: true } });
  for (const u of users) {
    const prefs = (u.notifPrefs as any) || {};
    if (prefs.digest === false) continue;
    const tasks = await prisma.task.findMany({
      where: { assigneeId: u.id, deletedAt: null, st: { not: 'done' }, ms: false, e: { lte: T + 1 } },
      select: { name: true, e: true }, take: 20,
    });
    if (!tasks.length) continue;
    const rows = tasks.map((t) => `<li>${t.name}${t.e != null && t.e < T ? ' — <b style="color:#DC2626">overdue</b>' : ''}</li>`).join('');
    await sendEmail(u.email, 'Your Velox tasks for today', `<h2>Hi ${u.name.split(' ')[0]}</h2><p>Tasks needing attention:</p><ul>${rows}</ul>`);
  }
}
