import ExcelJS from 'exceljs';
import { EP, todayIdx } from './data.ts';

// Rich Gantt-chart .xlsx export: task table on the left, a colored per-day
// (or per-week for long projects) timeline on the right. Pure function of the
// project data so it stays testable outside the route.

type TaskRow = {
  id: string; name: string; parentId: string | null; assigneeId: string | null;
  pr: string; pg: number; st: string; s: number | null; e: number | null;
  ms: boolean; crit: boolean; ord: number; createdAt: Date;
};

const ST_META: Record<string, { label: string; color: string }> = {
  mut: { label: 'Not started', color: 'FF94A3B8' },
  prog: { label: 'In progress', color: 'FF6366F1' },
  risk: { label: 'At risk', color: 'FFF59E0B' },
  bad: { label: 'Overdue', color: 'FFEF4444' },
  done: { label: 'Done', color: 'FF10B981' },
};
const CRIT_COLOR = 'FFDC2626';
const HEADER_BG = 'FF1E293B';
const WEEKEND_BG = 'FFF1F5F9';
const WEEKEND_HD = 'FFE2E8F0';
const PARENT_BG = 'FFF8FAFC';
const GRID = 'FFE2E8F0';

// lighten an ARGB color toward white (0..1)
function lighten(argb: string, f: number): string {
  const n = (i: number) => parseInt(argb.slice(i, i + 2), 16);
  const mix = (c: number) => Math.round(c + (255 - c) * f).toString(16).padStart(2, '0').toUpperCase();
  return 'FF' + mix(n(2)) + mix(n(4)) + mix(n(6));
}
const fill = (argb: string): ExcelJS.Fill => ({ type: 'pattern', pattern: 'solid', fgColor: { argb } });
const thin = { style: 'thin' as const, color: { argb: GRID } };
const dateOf = (idx: number) => new Date(EP + idx * 864e5);
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export async function buildGanttXlsx(
  proj: { name: string; code: string; color: string },
  tasks: TaskRow[],
  userName: Record<string, string>,
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Velox';
  const ws = wb.addWorksheet('Gantt', {
    views: [{ state: 'frozen', xSplit: 7, ySplit: 4 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1, fitToHeight: 0 },
  });

  // ---- hierarchy: depth-first walk, parents before children ---------------
  const byPar = new Map<string | null, TaskRow[]>();
  const ids = new Set(tasks.map((t) => t.id));
  for (const t of tasks) {
    const key = t.parentId && ids.has(t.parentId) ? t.parentId : null;
    if (!byPar.has(key)) byPar.set(key, []);
    byPar.get(key)!.push(t);
  }
  for (const list of byPar.values()) list.sort((a, b) => a.ord - b.ord || a.createdAt.getTime() - b.createdAt.getTime());
  const ordered: Array<{ t: TaskRow; depth: number; isParent: boolean }> = [];
  const walk = (par: string | null, depth: number) => {
    for (const t of byPar.get(par) || []) {
      ordered.push({ t, depth, isParent: (byPar.get(t.id) || []).length > 0 });
      walk(t.id, depth + 1);
    }
  };
  walk(null, 0);

  // ---- timeline range ------------------------------------------------------
  const dated = tasks.filter((t) => t.s != null && t.e != null);
  const today = todayIdx();
  let lo = dated.length ? Math.min(...dated.map((t) => t.s!)) : today;
  let hi = dated.length ? Math.max(...dated.map((t) => t.e!)) : today;
  lo -= 2; hi += 2;
  const span = hi - lo + 1;
  const weekly = span > 240; // per-week buckets for very long projects
  const unit = weekly ? 7 : 1;
  if (weekly) lo -= ((lo % 7) + 7) % 7; // align buckets to Monday (day 0 = Mon)
  const nCols = Math.ceil((hi - lo + 1) / unit);
  const colDay = (c: number) => lo + c * unit; // first day of timeline column c (0-based)
  const T0 = 8; // first timeline column (H)

  // ---- title band ----------------------------------------------------------
  const projArgb = 'FF' + (proj.color || '#6366F1').replace('#', '').toUpperCase().padStart(6, '0');
  ws.mergeCells(1, 1, 1, 7);
  const title = ws.getCell(1, 1);
  title.value = `${proj.name}  ·  Gantt chart`;
  title.font = { size: 15, bold: true, color: { argb: 'FFFFFFFF' } };
  title.fill = fill(projArgb);
  title.alignment = { vertical: 'middle', indent: 1 };
  ws.getRow(1).height = 28;
  ws.mergeCells(2, 1, 2, 7);
  const sub = ws.getCell(2, 1);
  const fmtD = (i: number) => { const d = dateOf(i); return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`; };
  sub.value = `${proj.code || ''}  ·  ${tasks.length} tasks  ·  ${fmtD(lo)} – ${fmtD(hi)}  ·  exported ${fmtD(today)}${weekly ? '  ·  1 column = 1 week' : ''}`;
  sub.font = { size: 9, color: { argb: 'FF64748B' } };
  sub.alignment = { vertical: 'middle', indent: 1 };

  // ---- month header (row 3) + day/week header (row 4) ----------------------
  const HEADS = ['Task', 'PIC', 'Start', 'Due', 'Days', '%', 'Status'];
  HEADS.forEach((h, i) => {
    const c = ws.getCell(4, i + 1);
    c.value = h;
    c.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    c.fill = fill(HEADER_BG);
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center' };
  });
  ws.columns = [
    { width: 42 }, { width: 18 }, { width: 10 }, { width: 10 }, { width: 6 }, { width: 7 }, { width: 12 },
    ...Array.from({ length: nCols }, () => ({ width: weekly ? 5.5 : 3.2 })),
  ];
  let mStart = 0;
  for (let c = 0; c <= nCols; c++) {
    const mo = c < nCols ? dateOf(colDay(c)).getUTCMonth() + dateOf(colDay(c)).getUTCFullYear() * 12 : -1;
    const prev = dateOf(colDay(mStart)).getUTCMonth() + dateOf(colDay(mStart)).getUTCFullYear() * 12;
    if (c === nCols || mo !== prev) {
      ws.mergeCells(3, T0 + mStart, 3, T0 + c - 1);
      const cell = ws.getCell(3, T0 + mStart);
      const d = dateOf(colDay(mStart));
      cell.value = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
      cell.font = { bold: true, size: 9, color: { argb: 'FF334155' } };
      cell.alignment = { horizontal: 'left' };
      cell.border = { left: { style: 'thin', color: { argb: 'FF94A3B8' } } };
      mStart = c;
    }
  }
  for (let c = 0; c < nCols; c++) {
    const d0 = colDay(c);
    const cell = ws.getCell(4, T0 + c);
    const d = dateOf(d0);
    cell.value = weekly ? `${d.getUTCDate()}/${d.getUTCMonth() + 1}` : d.getUTCDate();
    const isToday = today >= d0 && today < d0 + unit;
    const isWknd = !weekly && d0 % 7 >= 5; // day 0 = Monday → 5,6 = weekend
    cell.font = { size: 8, bold: isToday, color: { argb: isToday ? 'FFFFFFFF' : 'FF64748B' } };
    cell.fill = fill(isToday ? 'FFEF4444' : isWknd ? WEEKEND_HD : 'FFF8FAFC');
    cell.alignment = { horizontal: 'center' };
  }

  // ---- task rows ------------------------------------------------------------
  let r = 5;
  for (const { t, depth, isParent } of ordered) {
    const row = ws.getRow(r);
    row.outlineLevel = Math.min(depth, 7);
    const st = ST_META[t.st] || ST_META.mut;
    const barColor = t.crit && t.st !== 'done' ? CRIT_COLOR : st.color;
    const name = ws.getCell(r, 1);
    name.value = t.name;
    name.alignment = { indent: depth, vertical: 'middle' };
    name.font = { size: 10, bold: isParent, strike: t.st === 'done' };
    ws.getCell(r, 2).value = t.assigneeId ? userName[t.assigneeId] || t.assigneeId : '—';
    if (t.s != null) { const c = ws.getCell(r, 3); c.value = dateOf(t.s); c.numFmt = 'dd mmm'; }
    if (t.e != null) { const c = ws.getCell(r, 4); c.value = dateOf(t.e); c.numFmt = 'dd mmm'; }
    ws.getCell(r, 5).value = t.ms ? '◆' : t.s != null && t.e != null ? t.e - t.s + 1 : null;
    const pg = ws.getCell(r, 6);
    pg.value = (t.pg || 0) / 100;
    pg.numFmt = '0%';
    pg.font = { size: 9, bold: true, color: { argb: barColor } };
    const stc = ws.getCell(r, 7);
    stc.value = st.label;
    stc.font = { size: 9, color: { argb: barColor } };
    for (let col = 2; col <= 7; col++) ws.getCell(r, col).alignment = { horizontal: 'center', vertical: 'middle' };
    if (isParent) for (let col = 1; col <= 7 + nCols; col++) ws.getCell(r, col).fill = fill(PARENT_BG);

    // timeline cells
    for (let c = 0; c < nCols; c++) {
      const d0 = colDay(c);
      const cell = ws.getCell(r, T0 + c);
      const inBar = t.s != null && t.e != null && t.e >= d0 && t.s < d0 + unit;
      if (inBar && t.ms) {
        cell.value = '◆';
        cell.font = { size: 9, color: { argb: 'FFD97706' } };
        cell.alignment = { horizontal: 'center', vertical: 'middle' };
      } else if (inBar) {
        const len = Math.max(1, Math.ceil((t.e! - t.s! + 1) / unit));
        const idx = Math.floor((d0 - t.s!) / unit);
        const doneCells = Math.round((len * (t.st === 'done' ? 100 : t.pg || 0)) / 100);
        cell.fill = fill(idx < doneCells ? barColor : lighten(barColor, 0.62));
      } else if (!weekly && d0 % 7 >= 5) {
        cell.fill = fill(isParent ? PARENT_BG : WEEKEND_BG);
      }
      if (!weekly && d0 === today) cell.border = { ...(cell.border || {}), left: { style: 'medium', color: { argb: 'FFEF4444' } } };
    }
    for (let col = 1; col <= 7; col++) ws.getCell(r, col).border = { top: thin, bottom: thin, left: thin, right: thin };
    r++;
  }
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4, column: 7 } };

  // ---- legend ----------------------------------------------------------------
  r += 1;
  const legend: Array<[string, string]> = [
    ...Object.values(ST_META).map((m) => [m.color, m.label] as [string, string]),
    [CRIT_COLOR, 'Critical path'],
  ];
  let lc = 1;
  for (const [color, label] of legend) {
    ws.getCell(r, lc).fill = fill(color);
    const lbl = ws.getCell(r, lc + 1);
    lbl.value = label;
    lbl.font = { size: 8.5, color: { argb: 'FF475569' } };
    lc += 2;
  }
  ws.getCell(r, lc).value = '◆';
  ws.getCell(r, lc).font = { size: 9, color: { argb: 'FFD97706' } };
  ws.getCell(r, lc + 1).value = 'Milestone';
  ws.getCell(r, lc + 1).font = { size: 8.5, color: { argb: 'FF475569' } };

  return Buffer.from(await wb.xlsx.writeBuffer());
}
