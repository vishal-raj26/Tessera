// Bitrefill Business API adapter (https://docs.bitrefill.com).
//
// What the public docs confirm, and this uses:
//   - base URL https://api.bitrefill.com/v2, Business auth: Basic base64(API_ID:API_SECRET)
//   - GET /products?country=..&type=gift_card (paged with meta._next), GET /products/{id}
//   - a product has id (slug), name, type, country, currency, in_stock, packages and/or range;
//     a package has package_id and value
//   - POST /invoices { products: [{ product_id, package_id, quantity }], payment_method: 'balance', auto_pay }
//   - GET /orders/{id} -> redemption_info.code
//
// What the public docs do NOT say: which package field holds our cost, and in what currency. This adapter
// will not guess. Record a real response first (npm run supplier:record), find the cost field there,
// then set BITREFILL_COST_FIELD (a path inside a package, e.g. "price" or "prices.USD") and
// BITREFILL_COST_CURRENCY=USD. Until both are set, every store/region is "unavailable" (no quote).
// Custom-amount ranges are ignored for the same reason (their cost isn't documented).

import { REGIONS } from '../catalog.js';

const BASE = 'https://api.bitrefill.com/v2';

// How a store's credit product is recognised by slug or name. A match must ALSO be for exactly the
// region's country and currency, and exactly one product may match (else set BITREFILL_PRODUCT_IDS).
const STORE_PATTERNS = {
  appstore: /(^|[^a-z])(itunes|app[- ]?store|apple)([^a-z]|$)/i,
  play: /google[- ]?play/i,
};

function headers(env) {
  const id = env.BITREFILL_API_ID;
  const secret = env.BITREFILL_API_SECRET;
  if (!id || !secret) throw new Error('BITREFILL_API_ID / BITREFILL_API_SECRET are not set');
  return { Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'), 'Content-Type': 'application/json' };
}

async function call(path, init, { fetchImpl, env }) {
  const url = path.startsWith('http') ? path : (env.BITREFILL_BASE_URL || BASE) + path;
  const res = await fetchImpl(url, { ...init, headers: { ...headers(env), ...(init.headers || {}) }, signal: AbortSignal.timeout(15000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bitrefill ${init.method || 'GET'} ${path} failed: ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

const dig = (obj, path) => path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
const up = (s) => String(s ?? '').toUpperCase();

/** Which product sells this store's credit in this country and currency. Throws unless exactly one. */
export function pickProduct(products, { region, store, currency }) {
  const pattern = STORE_PATTERNS[store];
  const matches = products.filter((p) => p && pattern.test(`${p.id} ${p.name}`)
    && up(p.country) === region && up(p.currency) === currency && (p.type == null || p.type === 'gift_card'));
  if (matches.length === 1) return matches[0];
  if (!matches.length) throw new Error(`no ${store} gift card for ${region} in ${currency}`);
  throw new Error(`several ${store} products for ${region} ${currency} (${matches.map((p) => p.id).join(', ')}): set BITREFILL_PRODUCT_IDS`);
}

/**
 * A product's detail (GET /products/{id}) as a snapshot. Strict: the product must be for this country and
 * currency and in stock; each package needs a package_id, a numeric value and a cost at costField in
 * costCurrency. Packages without a readable cost are dropped, and reported.
 */
export function toSnapshot(detail, { region, store, currency, costField, costCurrency, now = Date.now() }) {
  if (!costField || costCurrency !== 'USD') {
    throw new Error('Bitrefill cost field not verified: record a real response (npm run supplier:record), then set BITREFILL_COST_FIELD and BITREFILL_COST_CURRENCY=USD');
  }
  const p = detail?.data ?? detail;
  if (up(p?.country) !== region || up(p?.currency) !== currency) {
    throw new Error(`product ${p?.id} is ${up(p?.country)} ${up(p?.currency)}, not ${region} ${currency}`);
  }
  if (p.in_stock === false) throw new Error(`product ${p.id} is out of stock`);
  const dropped = [];
  const packages = [];
  for (const pk of p.packages || []) {
    const value = Number(pk?.value);
    const cost = Number(dig(pk, costField));
    const id = pk?.package_id;
    if (!id || !(value > 0) || !(cost > 0) || pk.in_stock === false) { dropped.push(id ?? JSON.stringify(pk).slice(0, 60)); continue; }
    packages.push({ id, productId: p.id, value, costUsd: cost });
  }
  return { region, store, currency, productId: p.id, packages, dropped, fetchedAt: now, source: `bitrefill:${p.id}`, live: true };
}

export function createBitrefillSupplier({ env = process.env, fetchImpl = fetch, now = Date.now, currencyOf = (r) => REGIONS[r]?.currency } = {}) {
  const io = { fetchImpl, env };
  return {
    name: 'bitrefill',
    live: true,
    async fetchSnapshot(region, store = 'appstore') {
      const currency = currencyOf(region);
      if (!currency) throw new Error(`unknown region ${region}`);
      const opts = { region, store, currency, costField: env.BITREFILL_COST_FIELD, costCurrency: up(env.BITREFILL_COST_CURRENCY), now: now() };
      if (!opts.costField || opts.costCurrency !== 'USD') toSnapshot({}, opts); // throws the "not verified" error before any request
      let ids = {};
      try { ids = JSON.parse(env.BITREFILL_PRODUCT_IDS || '{}'); } catch { throw new Error('BITREFILL_PRODUCT_IDS is not valid JSON'); }
      let id = ids[`${store}:${region}`];
      if (!id) {
        const all = [];
        let next = `/products?country=${region}&type=gift_card&limit=50`;
        for (let page = 0; next && page < 20; page++) {
          const body = await call(next, {}, io);
          all.push(...(body.data || []));
          next = body.meta?._next || null;
        }
        id = pickProduct(all, { region, store, currency }).id;
      }
      const detail = await call(`/products/${encodeURIComponent(id)}`, {}, io);
      return toSnapshot(detail, opts);
    },
    async purchase({ packages, reference }) {
      const body = await call('/invoices', {
        method: 'POST',
        body: JSON.stringify({
          products: packages.map((p) => ({ product_id: p.productId, package_id: p.id, quantity: 1 })),
          payment_method: 'balance',
          auto_pay: true,
          reference,
        }),
      }, io);
      const invoice = body.data ?? body;
      const out = [];
      for (const o of invoice.orders || []) {
        const get = async () => { const b = await call(`/orders/${o.id}`, {}, io); return b.data ?? b; };
        let order = await get();
        for (let i = 0; i < 10 && !order?.redemption_info?.code; i++) {
          await new Promise((r) => setTimeout(r, 1500));
          order = await get();
        }
        if (!order?.redemption_info?.code) throw new Error(`Order ${o.id} has no code yet`);
        out.push({ packageId: order.package_id ?? o.package_id, value: Number(order.value ?? 0), code: order.redemption_info.code, supplierRef: o.id });
      }
      return out;
    },
  };
}

export const bitrefillSupplier = createBitrefillSupplier();
