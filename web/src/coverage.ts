// How long the buyer's credit for a plan lasts. Credit bought later is used after the earlier credit
// runs out, so purchases of the same plan stack. A month is 30 days and the store's yearly plan 365,
// the same as the server's renewal reminder (engine.js remindRenewals).
import type { Order } from './api';

const DAY = 86400e3;
export const coverDays = (months: number) => (months === 12 ? 365 : 30 * (months || 1));

export interface Coverage { order: Order; endsAt: number; daysLeft: number }

/** The plan the buyer bought most recently, and how many days its credit still covers (negative once it ran out). */
export function latestCoverage(orders: Order[] | null, now = Date.now()): Coverage | null {
  const delivered = (orders ?? []).filter((o) => o.status === 'delivered' && (o.deliveredAt ?? o.createdAt));
  if (!delivered.length) return null;
  const when = (o: Order) => (o.deliveredAt ?? o.createdAt);
  const latest = delivered.reduce((a, b) => (when(b) > when(a) ? b : a));
  const same = delivered
    .filter((o) => o.plan.id === latest.plan.id && (o.store?.id ?? 'appstore') === (latest.store?.id ?? 'appstore'))
    .sort((a, b) => when(a) - when(b));
  let end = 0;
  for (const o of same) end = Math.max(end, when(o)) + coverDays(o.months ?? 1) * DAY;
  const daysLeft = Math.ceil((end - now) / DAY);
  // long after it ran out, the buyer is treated as new again
  return daysLeft > -30 ? { order: latest, endsAt: end, daysLeft } : null;
}
