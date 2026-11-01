// Bitrefill Business API adapter (https://docs.bitrefill.com).
// Needs a Business account (API ID + secret) with a prefunded balance.
// Flow: cache store-credit products (App Store or Google Play) per country -> POST /invoices with payment_method "balance", auto_pay
// -> GET /orders/:id for redemption_info.code.
// NOTE: written against the public docs; verify field names against your account's API reference
// and run it with Bitrefill's test products before going live.

const BASE = 'https://api.bitrefill.com/v2';

function headers() {
  const id = process.env.BITREFILL_API_ID;
  const secret = process.env.BITREFILL_API_SECRET;
  if (!id || !secret) throw new Error('BITREFILL_API_ID / BITREFILL_API_SECRET are not set');
  return {
    Authorization: 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64'),
    'Content-Type': 'application/json',
  };
}

async function api(path, init = {}) {
  const res = await fetch(BASE + path, { ...init, headers: { ...headers(), ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Bitrefill ${init.method || 'GET'} ${path} failed: ${res.status} ${JSON.stringify(body)}`);
  return body.data ?? body;
}

const cache = new Map(); // `${regionCode}:${store}` -> { at, packages }
const TTL = 10 * 60 * 1000;

const MATCH = {
  appstore: (s) => s.includes('itunes') || s.includes('app-store') || s.includes('app store') || s.includes('apple-gift'),
  play: (s) => s.includes('google-play') || s.includes('google play') || s.includes('googleplay'),
};
const isStoreProduct = (store) => (p) => MATCH[store](`${p.id} ${p.name}`.toLowerCase()) && p.in_stock !== false;

export const bitrefillSupplier = {
  name: 'bitrefill',
  async listPackages(regionCode, store = 'appstore') {
    const ck = `${regionCode}:${store}`;
    const hit = cache.get(ck);
    if (hit && Date.now() - hit.at < TTL) return hit.packages;
    const products = await api(`/products?country=${regionCode}&type=gift_card&limit=200`);
    const product = (Array.isArray(products) ? products : products.products || []).find(isStoreProduct(store));
    if (!product) { cache.set(ck, { at: Date.now(), packages: [] }); return []; }
    const detail = await api(`/products/${encodeURIComponent(product.id)}`);
    const packages = (detail.packages || []).map((pk) => ({
      id: pk.package_id ?? pk.id,
      productId: product.id,
      value: Number(pk.value),
      // Bitrefill returns the price you pay; adjust the field name to your API response.
      costUsd: Number(pk.price_usd ?? pk.usd_price ?? pk.price),
    })).filter((p) => p.value > 0 && p.costUsd > 0);
    cache.set(ck, { at: Date.now(), packages });
    return packages;
  },
  async purchase({ packages, reference }) {
    const invoice = await api('/invoices', {
      method: 'POST',
      body: JSON.stringify({
        products: packages.map((p) => ({ product_id: p.productId, package_id: p.id, quantity: 1 })),
        payment_method: 'balance',
        auto_pay: true,
        reference,
      }),
    });
    const out = [];
    for (const o of invoice.orders || []) {
      let order = await api(`/orders/${o.id}`);
      for (let i = 0; i < 10 && !order.redemption_info?.code; i++) {
        await new Promise((r) => setTimeout(r, 1500));
        order = await api(`/orders/${o.id}`);
      }
      if (!order.redemption_info?.code) throw new Error(`Order ${o.id} has no code yet`);
      out.push({ packageId: order.package_id ?? o.package_id, value: Number(order.value ?? 0), code: order.redemption_info.code, supplierRef: o.id });
    }
    return out;
  },
};
