import { MO, DW } from './meta';

// EP (epoch day 0) is provided by the backend at bootstrap; default matches seed.
export let EP = Date.UTC(2026, 5, 29);
export let TODAY = 11;
export function setEpoch(ep: number, today: number) {
  EP = ep;
  TODAY = today;
}

export const dayMs = 864e5;
export const dateOf = (d: number) => new Date(EP + d * dayMs);
export const fmt = (d: number) => {
  const dt = dateOf(d);
  return MO[dt.getUTCMonth()] + ' ' + dt.getUTCDate();
};
export const dowIdx = (d: number) => ((d % 7) + 7) % 7;
export const dowLetter = (d: number) => DW[dowIdx(d)];
