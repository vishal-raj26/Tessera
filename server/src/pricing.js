// From a store price to the cards we buy:
//   in-app price for the term (the store's own yearly price for 12 months)
//   -> store credit needed: price plus the most sales tax the store can add at checkout (taxRate)
//   -> the supplier's current cards for exactly this store, country and currency
//   -> the cheapest mix of those cards that covers the credit.
// Pure functions: no I/O, so every rule here is tested directly (test/pricing.test.js).

const round2 = (x) => Math.round(x * 100) / 100;

/** A quote can't be made from the supplier data; `code` says why (shown to admins, not buyers). */
export class SupplierUnavailable extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

/**
 * Store credit to buy for an in-app price. taxRate covers sales tax that the store adds on top of the
 * listed price (US, Canada); 0 where prices include tax. Rounded up to the cent, so it never falls short.
 */
export function requiredCredit(appPrice, taxRate = 0) {
  if (!(appPrice > 0)) return null;
  if (!(taxRate >= 0 && taxRate < 1)) throw new Error(`bad tax rate ${taxRate}`);
  return Math.ceil(appPrice * (1 + taxRate) * 100 - 1e-6) / 100;
}

/**
 * The supplier's cards usable for one store, country and currency, or a SupplierUnavailable error.
 * A snapshot is { region, store, currency, productId, packages: [{ id, productId, value, costUsd }],
 * fetchedAt, source, live }. Never mixes stores, countries or currencies: a snapshot for anything else
 * is refused, and so is any card that doesn't belong to the snapshot's one product.
 */
export function usableCards(snapshot, { region, store, currency, now = Date.now(), maxAgeMs }) {
  if (!snapshot) throw new SupplierUnavailable('none', `no supplier data for ${store} ${region}`);
  if (snapshot.region !== region || snapshot.store !== store || snapshot.currency !== currency) {
    throw new SupplierUnavailable('mismatch',
      `supplier data is for ${snapshot.store} ${snapshot.region} ${snapshot.currency}, not ${store} ${region} ${currency}`);
  }
  if (maxAgeMs != null && !(now - snapshot.fetchedAt <= maxAgeMs)) {
    throw new SupplierUnavailable('stale', `supplier data for ${store} ${region} is ${Math.round((now - snapshot.fetchedAt) / 60e3)} min old`);
  }
  const cards = (snapshot.packages || []).filter((p) =>
    p && p.productId === snapshot.productId && p.available !== false
    && Number.isFinite(p.value) && p.value > 0 && Number.isFinite(p.costUsd) && p.costUsd > 0);
  if (!cards.length) throw new SupplierUnavailable('empty', `no cards available for ${store} ${region}`);
  return cards;
}

/**
 * Pick the combination of the region's card denominations that covers `needed` for the least money,
 * using at most maxCodes codes (default 10, more only when even the biggest card needs more). Exact: a min-cost search over (codes used, face value)
 * in steps of the denominations' common divisor, so a cheap mix that needs many small cards can never
 * hide a cheaper mix that fits the code limit. Ties go to fewer codes, then to less leftover credit.
 * Returns null when nothing covers it. packages: [{ id, value, costUsd }]
 */
export function pickPackages(packages, needed, maxCodes) {
  const list = packages.filter((p) => p.value > 0 && Number.isFinite(p.costUsd));
  if (!list.length || !(needed > 0)) return null;
  // up to 10 codes, or as many as the biggest card needs for a large order (so it still gets a price)
  maxCodes ??= Math.max(10, Math.ceil(needed / Math.max(...list.map((p) => p.value))));
  const cents = list.map((p) => Math.round(p.value * 100));
  const gcd = (a, b) => (b ? gcd(b, a % b) : a);
  const unit = cents.reduce(gcd);
  const units = cents.map((c) => c / unit);
  const need = Math.ceil((needed * 100 - 1e-6) / unit);
  // face values past `need` only matter up to one card over (more is never cheaper); keep them as one "covered" cell
  const top = need + Math.max(...units);
  if (top * maxCodes > 2e7) return null;
  const W = top + 1;
  // cost[n * W + u]: cheapest way to reach exactly u units with exactly n codes
  const cost = new Float64Array(W * (maxCodes + 1)).fill(Infinity);
  const from = new Int16Array(W * (maxCodes + 1)).fill(-1);
  cost[0] = 0;
  let best = null; // { n, u, c }
  for (let n = 1; n <= maxCodes; n++) {
    const prevRow = (n - 1) * W, row = n * W;
    let any = false;
    for (let u = 0; u < need; u++) { // only extend mixes that don't cover yet
      const c0 = cost[prevRow + u];
      if (c0 === Infinity) continue;
      for (let k = 0; k < list.length; k++) {
        const v = Math.min(top, u + units[k]);
        const c = c0 + list[k].costUsd;
        if (c < cost[row + v] - 1e-9) { cost[row + v] = c; from[row + v] = k; any = true; }
      }
    }
    if (!any) break;
    for (let u = need; u <= top; u++) {
      const c = cost[row + u];
      if (c === Infinity) continue;
      // strictly cheaper wins; equal cost keeps the earlier (fewer codes) or smaller face
      if (!best || c < best.c - 1e-9 || (Math.abs(c - best.c) <= 1e-9 && n === best.n && u < best.u)) best = { n, u, c };
    }
  }
  if (!best) return null;
  const combo = [];
  for (let n = best.n, u = best.u; n > 0; n--) {
    const k = from[n * W + u];
    combo.push(list[k]);
    // step back: the previous face is whatever, with one card fewer, led here at that cost
    const prevRow = (n - 1) * W;
    let back = -1;
    for (let p = 0; p < need; p++) {
      if (Math.min(top, p + units[k]) === u && Math.abs(cost[prevRow + p] + list[k].costUsd - cost[n * W + u]) <= 1e-9) { back = p; break; }
    }
    u = back;
  }
  combo.sort((a, b) => b.value - a.value);
  return { packages: combo, faceValue: round2(combo.reduce((t, p) => t + p.value, 0)), costUsd: round2(combo.reduce((t, p) => t + p.costUsd, 0)) };
}

