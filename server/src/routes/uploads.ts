import type { Express } from 'express';
import multer from 'multer';
import { mkdirSync, existsSync, createReadStream } from 'node:fs';
import { join, extname } from 'node:path';
import { nanoid } from 'nanoid';
import { prisma, requireAuth, h, HttpError, assertCan, workspaceOfTask } from '../ctx.ts';

const UPLOAD_DIR = process.env.UPLOAD_DIR || join(process.cwd(), 'uploads');
if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => cb(null, `${nanoid(16)}${extname(file.originalname).slice(0, 10)}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25 MB

const humanSize = (n: number) => n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`;
const kindOf = (name: string, mime: string) => {
  const e = extname(name).toLowerCase();
  if (mime.startsWith('image/')) return 'img';
  if (e === '.pdf') return 'pdf';
  if (['.xls', '.xlsx', '.csv'].includes(e)) return 'xls';
  if (['.doc', '.docx'].includes(e)) return 'doc';
  return 'file';
};

export function registerUploadRoutes(app: Express) {
  // upload a real file attachment
  app.post('/api/tasks/:id/files', requireAuth, upload.single('file'), h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'MEMBER');
    if (!req.file) throw new HttpError(400, 'no file');
    const f = await prisma.fileAsset.create({ data: {
      taskId: req.params.id, n: req.file.originalname.slice(0, 200), s: humanSize(req.file.size),
      k: kindOf(req.file.originalname, req.file.mimetype), url: `/api/files/${req.file.filename}`, bytes: req.file.size,
    } });
    res.json({ id: f.id, n: f.n, s: f.s, k: f.k, url: f.url });
  }));

  // attach an external link (Drive/OneDrive)
  app.post('/api/tasks/:id/links', requireAuth, h(async (req: any, res) => {
    await assertCan(req.user.id, await workspaceOfTask(req.params.id), 'MEMBER');
    const url = String(req.body?.url || ''); const n = String(req.body?.name || url).slice(0, 200);
    if (!/^https?:\/\//.test(url)) throw new HttpError(400, 'invalid url');
    const f = await prisma.fileAsset.create({ data: { taskId: req.params.id, n, s: 'link', k: 'link', url } });
    res.json({ id: f.id, n: f.n, s: f.s, k: f.k, url: f.url });
  }));

  app.delete('/api/files/:id', requireAuth, h(async (req: any, res) => {
    const f = await prisma.fileAsset.findUnique({ where: { id: req.params.id }, select: { taskId: true } });
    if (!f) throw new HttpError(404, 'not found');
    await assertCan(req.user.id, await workspaceOfTask(f.taskId), 'MEMBER');
    await prisma.fileAsset.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  }));

  // serve a stored file (auth required)
  app.get('/api/files/:name', requireAuth, h(async (req: any, res) => {
    const name = req.params.name.replace(/[^a-zA-Z0-9._-]/g, '');
    const path = join(UPLOAD_DIR, name);
    if (!existsSync(path)) throw new HttpError(404, 'not found');
    createReadStream(path).pipe(res);
  }));
}
