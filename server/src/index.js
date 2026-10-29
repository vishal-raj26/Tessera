import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { PLANS, REGIONS, pickPackages, round2 } from './catalog.js';
import { mockSupplier } from './supplier/mock.js';
import { bitrefillSupplier } from './supplier/bitrefill.js';
import { orders, payments, settings } from './db.js';
import { gramUsd, refreshRate, rateAgeMs, RATE_MAX_AGE_MS, commentPayload, recentIncoming, normalize, friendly, NETWORK } from './chain.js';
import { createEngine } from './engine.js';
import { startPaymentStream } from './stream.js';
import { startAdminBot } from './bot.js';
import { telegramAuth } from './telegram.js';

const PORT = Number(process.env.PORT || 8787);
const SUPPLIER = process.env.SUPPLIER === 'bitrefill' ? bitrefillSupplier : mockSupplier;
const PAYMENT_MODE = process.env.PAYMENT_MODE || 'mock'; // mock | chain
const MERCHANT = process.env.MERCHANT_WALLET || '';
const MARGIN = Number(process.env.MARGIN ?? 0.08);
// The App Store country we sell credit for. Set by you, never shown to users.
const STORE_REGION = String(process.env.STORE_REGION || 'US').toUpperCase();
const QUOTE_TTL_MS = 20 * 60 * 1000;
// Telegram Stars: Telegram requires Stars for digital goods inside Mini Apps. STAR_USD is what one Star
// is worth to you when you withdraw (not what buyers pay for it), so the Stars price covers your cost.
const STARS = process.env.STARS !== 'off';
const STAR_USD = Number(process.env.STAR_USD || 0.013);
const STARS_MARGIN = Number(process.env.STARS_MARGIN ?? MARGIN);

if (PAYMENT_MODE === 'chain' && !normalize(MERCHANT)) {
  console.error('PAYMENT_MODE=chain needs a valid MERCHANT_WALLET');
  process.exit(1);
}
const MERCHANT_FRIENDLY = MERCHANT && normalize(MERCHANT) ? friendly(MERCHANT, NETWORK) : null;

const NANO = 1_000_000_000n;
const toNano = (gram) => BigInt(Math.ceil(gram * 100)) * (NANO / 100n); // round up to 0.01 GRAM
const fromNano = (n) => Number(BigInt(n)) / 1e9;

/** In-app price: an admin override set with /price in the bot, else the default in catalog.js. */
function inAppPrice(regionCode, planId) {
  const o = settings.get(`price:${regionCode}:${planId}`);
  return o != null ? Number(o) : REGIONS[regionCode]?.prices?.[planId];
}

async function quote(regionCode, planId) {
  const region = REGIONS[regionCode];
  const price = inAppPrice(regionCode, planId);
  if (!price) return null;
  const packages = await SUPPLIER.listPackages(regionCode);
  if (!packages.length) return null;
  const needed = price * (1 + (region.taxBuffer || 0));
  const pick = pickPackages(packages, needed);
  if (!pick) return null;
  // demo and testnet tolerate an old rate (no real value moves); mainnet refuses to quote GRAM on a stale one
  const rate = await gramUsd({ allowStale: PAYMENT_MODE === 'mock' || NETWORK === 'testnet' });
  const stars = STARS ? Math.max(1, Math.ceil((pick.costUsd * (1 + STARS_MARGIN)) / STAR_USD)) : null;
  if (!rate && !stars) return { stale: true };
  // On testnet, TEST_PRICE_SCALE shrinks the GRAM amount so a faucet's few GRAM cover several test buys.
  const scale = NETWORK === 'testnet' ? Number(process.env.TEST_PRICE_SCALE || 1) : 1;
  const amountNano = rate ? toNano(((pick.costUsd * (1 + MARGIN)) / rate) * scale) : null;
  return {
    stale: !rate, // GRAM is paused, Stars still works
    stars,
    regionCode, planId,
    appPrice: price,
    currency: region.currency,
    credit: pick.faceValue,
    codes: pick.packages.length,
    packages: pick.packages,
    costUsd: pick.costUsd,
    usd: round2(pick.costUsd * (1 + MARGIN)),
    gram: amountNano ? fromNano(amountNano) : null,
    amountNano: amountNano ? amountNano.toString() : null,
    gramUsd: rate,
  };
}

const app = express();
app.use(cors());
app.use(express.json());

// TON Connect manifest, built from PUBLIC_URL so it always matches where the Mini App is hosted.
app.get('/tonconnect-manifest.json', (req, res) => {
  const url = process.env.PUBLIC_URL || `${req.protocol}://${req.get('host')}`;
  res.json({ url, name: 'Tessera', iconUrl: `${url}/icon-512.png`, termsOfUseUrl: `${url}/terms`, privacyPolicyUrl: `${url}/privacy` });
});

app.get('/healthz', (req, res) => res.json({ ok: true, network: NETWORK, payments: PAYMENT_MODE }));

app.get('/api/config', (req, res) => {
  res.json({ paymentMode: PAYMENT_MODE, network: NETWORK, merchant: MERCHANT_FRIENDLY, supplier: SUPPLIER.name, region: STORE_REGION, stars: STARS });
});

// Regions the supplier can actually fulfil right now, intersected with regions we have Claude prices for.
app.get('/api/regions', async (req, res) => {
  const list = await Promise.all(Object.entries(REGIONS).map(async ([code, r]) => {
    const pk = await SUPPLIER.listPackages(code).catch(() => []);
    return pk.length ? { code, name: r.name, flag: r.flag, currency: r.currency } : null;
  }));
  res.json({ regions: list.filter(Boolean) });
});

app.get('/api/catalog', async (req, res) => {
  const code = String(req.query.region || STORE_REGION).toUpperCase();
  if (!REGIONS[code]) return res.status(400).json({ error: 'Unknown region' });
  let stale = false;
  const plans = await Promise.all(PLANS.map(async (p) => {
    const q = await quote(code, p.id).catch(() => null);
    if (q?.stale) stale = true;
    const ok = q && (q.gram || q.stars);
    return { ...p, available: !!ok, ...(ok && { appPrice: q.appPrice, currency: q.currency, credit: q.credit, codes: q.codes, gram: q.gram, stars: q.stars, usd: q.usd }) };
  }));
  res.json({ region: { code, ...REGIONS[code], prices: undefined }, plans, pricesUpdating: stale });
});

const publicOrder = (o) => o && {
  id: o.id,
  region: o.region,
  regionName: REGIONS[o.region]?.name,
  flag: REGIONS[o.region]?.flag,
  plan: PLANS.find((p) => p.id === o.plan_id),
  credit: o.face_value,
  currency: o.currency,
  method: o.method,
  stars: o.stars,
  gram: fromNano(o.amount_nano),
  amountNano: o.amount_nano,
  comment: o.comment,
  merchant: MERCHANT_FRIENDLY,
  network: NETWORK,
  receivedNano: o.received_nano,
  paymentSeen: !!o.seen_at || ['paid', 'fulfilling', 'delivered'].includes(o.status),
  payload: commentPayload(o.comment),
  status: o.status,
  error: o.error,
  txHash: o.tx_hash,
  codes: o.status === 'delivered' ? o.codes : null,
  createdAt: o.created_at,
  expiresAt: o.expires_at,
};

app.post('/api/orders', telegramAuth, async (req, res) => {
  const { region, planId, wallet } = req.body || {};
  const method = req.body?.method === 'stars' ? 'stars' : 'gram';
  const code = String(region || STORE_REGION).toUpperCase();
  const q = await quote(code, planId).catch((e) => { console.error(e); return null; });
  if (!q || (!q.gram && !q.stars)) return res.status(q?.stale ? 503 : 400).json({ error: q?.stale ? 'Prices are updating. Try again in a minute.' : 'This plan is not available right now.' });
  if (method === 'gram' && !q.gram) return res.status(503).json({ error: 'GRAM prices are updating. Pay with Stars, or try again in a minute.' });
  if (method === 'stars' && !q.stars) return res.status(400).json({ error: 'Stars payments are off right now.' });
  const now = Date.now();
  const id = crypto.randomUUID();
  const memo = 'TS-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  orders.insert({
    id, tgUserId: String(req.tgUser.id), wallet: wallet || null, region: code, planId,
    packages: q.packages, faceValue: q.credit, currency: q.currency, costUsd: q.costUsd,
    amountNano: method === 'gram' ? q.amountNano : '0', comment: memo, createdAt: now, expiresAt: now + QUOTE_TTL_MS,
    method, stars: method === 'stars' ? q.stars : null,
  });
  let invoiceLink = null;
  if (method === 'stars') {
    try {
      invoiceLink = await bot.createInvoice(orders.get(id));
    } catch (e) {
      console.error(`[order ${id}] invoice failed`, e.message);
      orders.transition(id, 'awaiting_payment', 'expired');
      return res.status(502).json({ error: "Couldn't start the Stars payment. Try again." });
    }
  }
  res.json({ ...publicOrder(orders.get(id)), invoiceLink });
});

app.get('/api/orders', telegramAuth, (req, res) => {
  res.json({ orders: orders.byUser(String(req.tgUser.id)).map(publicOrder) });
});

app.get('/api/orders/:id', telegramAuth, (req, res) => {
  const o = orders.get(req.params.id);
  if (!o || o.tg_user_id !== String(req.tgUser.id)) return res.status(404).json({ error: 'Order not found' });
  res.json(publicOrder(o));
});

// Demo-only: pretend the payment landed.
if (PAYMENT_MODE === 'mock') {
  app.post('/api/orders/:id/mock-pay', telegramAuth, (req, res) => {
    const o = orders.get(req.params.id);
    if (!o || o.tg_user_id !== String(req.tgUser.id)) return res.status(404).json({ error: 'Order not found' });
    if (o.status === 'awaiting_payment' && o.method === 'stars') {
      // simulate Telegram's successful_payment arriving
      const chargeId = 'mock_' + crypto.randomBytes(8).toString('hex');
      setTimeout(() => engine.applyStars({ orderId: o.id, amount: o.stars, chargeId, userId: o.tg_user_id }).catch(console.error), 900);
    } else if (o.status === 'awaiting_payment') {
      // simulate the transfer landing on chain a moment later
      const tx = { hash: 'mock_' + crypto.randomBytes(8).toString('hex'), comment: o.comment, valueNano: BigInt(o.amount_nano), source: 'mock' };
      setTimeout(() => engine.seePending(tx), 600); // like the stream's "pending"
      setTimeout(() => engine.applyTransfer(tx).catch(console.error), 2500); // like "finalized"
    }
    res.json(publicOrder(orders.get(o.id)));
  });
}

// ---- background workers -------------------------------------------------

const prices = {
  list: (region = STORE_REGION) => PLANS.map((p) => ({ plan: p.id, name: p.name, price: inAppPrice(region, p.id), currency: REGIONS[region]?.currency, overridden: settings.get(`price:${region}:${p.id}`) != null })),
  set(region, plan, value) {
    if (!REGIONS[region]) return 'Unknown region';
    if (!PLANS.some((p) => p.id === plan)) return `Unknown plan. Use one of: ${PLANS.map((p) => p.id).join(', ')}`;
    if (!(value > 0)) return 'Price must be a positive number';
    settings.set(`price:${region}:${plan}`, value);
    return null;
  },
  region: STORE_REGION,
};
const bot = startAdminBot({ getEngine: () => engine, orders, prices, publicUrl: process.env.PUBLIC_URL });
const engine = createEngine({
  orders,
  payments,
  supplier: SUPPLIER,
  fetchIncoming: PAYMENT_MODE === 'chain' ? () => recentIncoming(MERCHANT) : null,
  notify: (e) => bot.notify(e),
});

// Instant detection via the streaming API; the poller catches anything the stream missed.
// While the stream is connected we poll every 15s; while it's down, every 5s.
let streamUp = false;
if (PAYMENT_MODE === 'chain' && process.env.TON_STREAM !== 'off') {
  startPaymentStream({
    merchant: MERCHANT,
    onPending: (t) => engine.seePending(t),
    onFinal: (t) => engine.applyTransfer(t).catch(console.error),
    onState: (up) => { streamUp = up; },
  });
}

let ticking = false;
let lastTick = 0;
setInterval(async () => {
  if (ticking || (streamUp && Date.now() - lastTick < 15000)) return;
  ticking = true;
  try { await engine.tick(); } catch (e) { console.error(e); } finally { ticking = false; lastTick = Date.now(); }
}, 5000);
engine.resume().catch(console.error);

// Rate watchdog: alert once when the GRAM/USD feed goes stale, once when it recovers.
let rateAlerted = false;
if (PAYMENT_MODE === 'chain' && NETWORK === 'mainnet') {
  setInterval(async () => {
    await refreshRate();
    const stale = rateAgeMs() > RATE_MAX_AGE_MS;
    if (stale && !rateAlerted) { rateAlerted = true; bot.notify({ type: 'rate_stale', minutes: Math.round(rateAgeMs() / 60e3) }); }
    if (!stale && rateAlerted) { rateAlerted = false; bot.notify({ type: 'rate_ok' }); }
  }, 60_000);
}

// Renewal reminders: checked hourly, sent ~3 days before the buyer's month ends.
setInterval(() => { try { engine.remindRenewals(); } catch (e) { console.error(e); } }, 3600e3);

// Serve the built Mini App when present.
const dist = path.resolve(process.env.WEB_DIST || '../web/dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get(/^\/(?!api\/).*/, (req, res) => res.sendFile(path.join(dist, 'index.html')));
}

app.listen(PORT, () => console.log(`Tessera API on :${PORT} · supplier=${SUPPLIER.name} · payments=${PAYMENT_MODE} · network=${NETWORK}`));
