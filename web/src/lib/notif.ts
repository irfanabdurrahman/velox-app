import type { Notif } from '../types';

// icon background/colour per notification kind — ported from the prototype.
export function notifVM(n: Notif) {
  const map: Record<string, { icBg: string; icCo: string }> = {
    ai: { icBg: 'var(--accS)', icCo: 'var(--accT)' },
    mention: { icBg: 'var(--inB)', icCo: 'var(--inT)' },
    assign: { icBg: 'var(--okB)', icCo: 'var(--okT)' },
    status: { icBg: 'var(--waB)', icCo: 'var(--waT)' },
    comment: { icBg: 'var(--muB)', icCo: 'var(--muT)' },
  };
  return { ...(map[n.kind] || map.comment) };
}
