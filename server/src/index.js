import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import crypto from 'node:crypto';
import path from 'node:path';
import fs from 'node:fs';
import { REGIONS, TERMS, STORES, enabledProducts, findPlan, priceKeys, round2, termLabel } from './catalog.js';
import { requiredCredit, usableCards, pickPackages, SupplierUnavailable } from './pricing.js';
import { cachedSupplier } from './supplier/cache.js';
import { mockSupplier } from './supplier/mock.js';
import { bitrefillSupplier } from './supplier/bitrefill.js';
import { orders, payments, settings } from './db.js';
import { gramUsd, refreshRate, startRateFeed, rateStatus, rateAgeMs, RATE_MAX_AGE_MS, commentPayload, recentIncoming, normalize, friendly, NETWORK } from './chain.js';
import { createEngine } from './engine.js';
import { startApplePriceSync } from './applePrices.js';
import { startPaymentStream } from './stream.js';
import { startAdminBot } from './bot.js';
import { telegramAuth } from './telegram.js';

const PORT = Number(process.env.PORT || 8787);
// Supplier cards are cached per store and region; data older than SUPPLIER_MAX_AGE_MIN is never priced.
const SUPPLIER = cachedSupplier(process.env.SUPPLIER === 'bitrefill' ? bitrefillSupplier : mockSupplier, {
  maxAgeMs: Number(process.env.SUPPLIER_MAX_AGE_MIN || 30) * 60e3,
});
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
// Stars are priced to cost the buyer about the same as GRAM (STAR_BUYER_USD is roughly what a buyer
// pays Telegram per Star), but never below our cost plus STARS_MIN_MARGIN at the payout rate.
const STAR_BUYER_USD = Number(process.env.STAR_BUYER_USD || 0.02);
const STARS_MIN_MARGIN = Number(process.env.STARS_MIN_MARGIN ?? process.env.STARS_MARGIN ?? 0.03);
const starsFor = (costUsd) => Math.max(1,
  Math.ceil((costUsd * (1 + MARGIN)) / STAR_BUYER_USD),
  Math.ceil((costUsd * (1 + STARS_MIN_MARGIN)) / STAR_USD));

if (PAYMENT_MODE === 'chain' && !normalize(MERCHANT)) {
  console.error('PAYMENT_MODE=chain needs a valid MERCHANT_WALLET');
  process.exit(1);
}
// The mock supplier issues fake codes from recorded storefront data: never let it take real money.
if (!SUPPLIER.live && NETWORK === 'mainnet' && (PAYMENT_MODE === 'chain' || (STARS && process.env.BOT_TOKEN))) {
  console.error('SUPPLIER=mock issues fake codes: it can only run in demo mode (PAYMENT_MODE=mock, no Stars) or on testnet. Set SUPPLIER=bitrefill for mainnet.');
  process.exit(1);
}
const MERCHANT_FRIENDLY = MERCHANT && normalize(MERCHANT) ? friendly(MERCHANT, NETWORK) : null;

const NANO = 1_000_000_000n;
const toNano = (gram) => BigInt(Math.ceil(gram * 100)) * (NANO / 100n); // round up to 0.01 GRAM
const fromNano = (n) => Number(BigInt(n)) / 1e9;

/**
 * In-app price of a price key in a store: an admin override (/price), else the App Store price synced by
 * applePrices.js, else the default in catalog.js. Google Play has no defaults: Play prices come from /price.
 */
const overrideKey = (regionCode, key, store) => (store === 'play' ? `price:${regionCode}:play:${key}` : `price:${regionCode}:${key}`);
function inAppPrice(regionCode, key, store = 'appstore') {
  const override = settings.get(overrideKey(regionCode, key, store));
  if (override != null) return Number(override);
  if (store !== 'appstore') return null;
  const synced = settings.get(`apple:${regionCode}:${key}`);
  if (synced != null) return Number(synced);
  return REGIONS[regionCode]?.prices?.[key] ?? null;
}
const priceSource = (regionCode, key, store = 'appstore') =>
  settings.get(overrideKey(regionCode, key, store)) != null ? 'set by you'
    : store !== 'appstore' ? 'not set'
      : settings.get(`apple:${regionCode}:${key}`) != null ? 'App Store' : 'default';

// Terms on offer for a plan in a store: 1, 3 and 6 months wherever it has a monthly price, and 12 months
// wherever the store has a yearly price for it (its own yearly plan).
const termsAt = (regionCode, planId, store = 'appstore') => {
  const plan = findPlan(planId)?.plan;
  if (!plan || !inAppPrice(regionCode, plan.key, store)) return [];
  return TERMS.filter((m) => m !== 12 || !!(plan.yearlyKey && inAppPrice(regionCode, plan.yearlyKey, store)));
};
/** Price for a term: the store's yearly plan for 12 months, else that many monthly renewals. */
function termPrice(regionCode, planId, months, store = 'appstore') {
  const plan = findPlan(planId)?.plan;
  if (!plan || !termsAt(regionCode, planId, store).includes(months)) return null;
  if (months === 12) return inAppPrice(regionCode, plan.yearlyKey, store);
  const monthly = inAppPrice(regionCode, plan.key, store);
  return monthly ? round2(monthly * months) : null;
}
/** Sales tax a store may add on top of its listed price in a region: admin setting `tax:<R>`, else catalog. */
const taxRate = (regionCode) => {
  const set = settings.get(`tax:${regionCode}`);
  return set != null ? Number(set) : (REGIONS[regionCode]?.taxBuffer || 0);
};
const storeOf = (s) => (STORES[s] ? s : 'appstore');
const onSale = (planId) => { const f = findPlan(planId); return f && enabledProducts().some((p) => p.id === f.product.id) ? f : null; };

async function quote(regionCode, planId, months = 1, store = 'appstore') {
  const region = REGIONS[regionCode];
  if (!onSale(planId)) return null;
  const price = termPrice(regionCode, planId, months, store);
  if (!price) return null;
  // the credit to buy: the price plus the most sales tax the store can add at checkout
  const needed = requiredCredit(price, taxRate(regionCode));
  // the supplier's current cards for exactly this store, country and currency
  let cards, supplierInfo;
  try {
    const snap = await SUPPLIER.snapshot(regionCode, store);
    cards = usableCards(snap, { region: regionCode, store, currency: region.currency, maxAgeMs: SUPPLIER.maxAgeMs });
    supplierInfo = { source: snap.source, live: snap.live, fetchedAt: snap.fetchedAt };
  } catch (e) {
    if (e instanceof SupplierUnavailable) return { unavailable: e.code, reason: e.message };
    throw e;
  }
  // the cheapest mix of them that covers it
  const pick = pickPackages(cards, needed);
  if (!pick) return { unavailable: 'no_mix', reason: `no mix of cards covers ${needed} ${region.currency}` };
  // demo and testnet tolerate an old rate (no real value moves); mainnet refuses to quote GRAM on a stale one
  const rate = await gramUsd({ allowStale: PAYMENT_MODE === 'mock' || NETWORK === 'testnet' });
  // On testnet everything is charged at TEST_PRICE_SCALE, Stars included: Telegram Stars are real money
  // even while GRAM is on testnet, so a test purchase must not cost the real Stars price.
  const testScale = NETWORK === 'testnet' ? Number(process.env.TEST_PRICE_SCALE || 1) : 1;
  const stars = STARS ? Math.max(1, Math.ceil(starsFor(pick.costUsd) * testScale)) : null;
  if (!rate && !stars) return { stale: true };
  // On testnet, TEST_PRICE_SCALE shrinks the GRAM amount so a faucet's few GRAM cover several test buys.
  const scale = NETWORK === 'testnet' ? Number(process.env.TEST_PRICE_SCALE || 1) : 1;
  const amountNano = rate ? toNano(((pick.costUsd * (1 + MARGIN)) / rate) * scale) : null;
  return {
    stale: !rate, // GRAM is paused, Stars still works
    stars,
    regionCode, planId, months, store,
    annual: months === 12,
    monthly: inAppPrice(regionCode, findPlan(planId).plan.key, store),
    needed, taxRate: taxRate(regionCode), supplier: supplierInfo,
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

app.get('/healthz', (req, res) => res.json({ ok: true, network: NETWORK, payments: PAYMENT_MODE, gram: rateStatus(), supplier: { name: SUPPLIER.name, live: SUPPLIER.live, snapshots: SUPPLIER.status() } }));

app.get('/api/config', (req, res) => {
  const testScale = NETWORK === 'testnet' ? Number(process.env.TEST_PRICE_SCALE || 1) : 1;
  res.json({
    paymentMode: PAYMENT_MODE, network: NETWORK, merchant: MERCHANT_FRIENDLY, supplier: SUPPLIER.name, supplierLive: SUPPLIER.live, region: STORE_REGION, stars: STARS, testScale,
    products: enabledProducts().map((p) => ({ id: p.id, name: p.name, app: p.app })),
    stores: Object.values(STORES),
  });
});

// Regions the supplier can actually fulfil right now (App Store credit), intersected with regions we have prices for.
app.get('/api/regions', async (req, res) => {
  const list = await Promise.all(Object.entries(REGIONS).map(async ([code, r]) => {
    const ok = await SUPPLIER.snapshot(code, 'appstore')
      .then((snap) => usableCards(snap, { region: code, store: 'appstore', currency: r.currency, maxAgeMs: SUPPLIER.maxAgeMs }).length > 0)
      .catch(() => false);
    return ok ? { code, name: r.name, flag: r.flag, currency: r.currency } : null;
  }));
  res.json({ regions: list.filter(Boolean) });
});

// Every plan of every product on sale, priced for one store (?store=appstore|play). `storesPriced` says
// which stores have any priced plan, so the app only offers Google Play once Play prices are set.
app.get('/api/catalog', async (req, res) => {
  const code = String(req.query.region || STORE_REGION).toUpperCase();
  if (!REGIONS[code]) return res.status(400).json({ error: 'Unknown region' });
  const store = storeOf(req.query.store);
  let stale = false;
  const pick = (q) => ({ months: q.months, label: termLabel(q.months), annual: q.annual, monthly: q.monthly, appPrice: q.appPrice, needed: q.needed, currency: q.currency, credit: q.credit, codes: q.codes, gram: q.gram, stars: q.stars, usd: q.usd });
  const all = enabledProducts().flatMap((product) => product.plans.map((plan) => ({ product, plan })));
  const plans = await Promise.all(all.map(async ({ product, plan }) => {
    const quotes = await Promise.all(termsAt(code, plan.id, store).map((m) => quote(code, plan.id, m, store).catch(() => null)));
    if (quotes.some((q) => q?.stale)) stale = true;
    const terms = quotes.filter((q) => q && (q.gram || q.stars)).map(pick);
    const one = terms.find((t) => t.months === 1);
    return {
      id: plan.id, name: plan.name, label: plan.label, blurb: plan.blurb, term: 'month',
      product: { id: product.id, name: product.name, app: product.app },
      available: terms.length > 0, terms,
      // top-level fields keep describing one month, for older clients
      ...(one && { appPrice: one.appPrice, currency: one.currency, credit: one.credit, codes: one.codes, gram: one.gram, stars: one.stars, usd: one.usd }),
    };
  }));
  const storesPriced = Object.fromEntries(Object.keys(STORES).map((s) => [s, all.some(({ plan }) => termsAt(code, plan.id, s).length > 0)]));
  res.json({ region: { code, ...REGIONS[code], prices: undefined }, store, storesPriced, plans, pricesUpdating: stale });
});

const publicOrder = (o) => o && {
  id: o.id,
  region: o.region,
  regionName: REGIONS[o.region]?.name,
  flag: REGIONS[o.region]?.flag,
  plan: (({ id, name, label }) => ({ id, name, label, term: 'month' }))(findPlan(o.plan_id)?.plan ?? { id: o.plan_id, name: o.plan_id, label: o.plan_id }),
  product: (({ id, name, app }) => ({ id, name, app }))(findPlan(o.plan_id)?.product ?? { id: 'unknown', name: '', app: '' }),
  store: STORES[o.store ?? 'appstore'],
  months: o.months ?? 1,
  annual: o.months === 12,
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
  deliveredAt: o.delivered_at ?? null,
  expiresAt: o.expires_at,
};

// Held quotes: the review sheet asks for one when it opens, so the price it shows ("held for 20:00")
// is the price the order gets. Kept in memory; after a restart the order simply re-quotes.
const quotes = new Map();
const pruneQuotes = () => { const now = Date.now(); for (const [k, q] of quotes) if (q.expiresAt < now) quotes.delete(k); };
app.post('/api/quotes', telegramAuth, async (req, res) => {
  pruneQuotes();
  const { region, planId } = req.body || {};
  const months = Number(req.body?.months ?? 1);
  const code = String(region || STORE_REGION).toUpperCase();
  const store = storeOf(req.body?.store);
  // always a fresh price: a held quote is only ever *used* by an order, never renewed here, so nobody
  // can roll an old price forward by asking again before it expires
  const q = await quote(code, planId, months, store).catch((e) => { console.error(e); return null; });
  if (!q || (!q.gram && !q.stars)) return res.status(q?.stale ? 503 : 400).json({ error: q?.stale ? 'Prices are updating. Try again in a minute.' : 'This plan is not available right now.' });
  const id = crypto.randomUUID();
  const expiresAt = Date.now() + QUOTE_TTL_MS;
  quotes.set(id, { ...q, user: String(req.tgUser.id), expiresAt });
  // planId, store and region say exactly what this price is for, so the app can match it to the open review
  res.json({ id, expiresAt, planId: q.planId, store: q.store, region: q.regionCode, months: q.months, label: termLabel(q.months), annual: q.annual, monthly: q.monthly, appPrice: q.appPrice, needed: q.needed, currency: q.currency, credit: q.credit, codes: q.codes, gram: q.gram, stars: q.stars, usd: q.usd });
});

app.post('/api/orders', telegramAuth, async (req, res) => {
  const { region, planId, wallet } = req.body || {};
  const method = req.body?.method === 'stars' ? 'stars' : 'gram';
  const months = Number(req.body?.months ?? 1);
  const code = String(region || STORE_REGION).toUpperCase();
  const store = storeOf(req.body?.store);
  // use the held quote when it's this buyer's, for this plan and term, and still valid
  const held = quotes.get(String(req.body?.quoteId || ''));
  const useHeld = held && held.user === String(req.tgUser.id) && held.planId === planId && held.months === months
    && held.regionCode === code && held.store === store && held.expiresAt > Date.now();
  const q = useHeld ? held : await quote(code, planId, months, store).catch((e) => { console.error(e); return null; });
  if (!q || (!q.gram && !q.stars)) return res.status(q?.stale ? 503 : 400).json({ error: q?.stale ? 'Prices are updating. Try again in a minute.' : 'This plan is not available right now.' });
  if (method === 'gram' && !q.gram) return res.status(503).json({ error: 'GRAM prices are updating. Pay with Stars, or try again in a minute.' });
  if (method === 'stars' && !q.stars) return res.status(400).json({ error: 'Stars payments are off right now.' });
  const now = Date.now();
  const id = crypto.randomUUID();
  const memo = 'TS-' + crypto.randomBytes(5).toString('hex').toUpperCase();
  orders.insert({
    id, tgUserId: String(req.tgUser.id), wallet: wallet || null, region: code, planId,
    packages: q.packages, faceValue: q.credit, currency: q.currency, costUsd: q.costUsd,
    // a held quote keeps its own deadline, but the buyer always gets at least 10 minutes to pay
    amountNano: method === 'gram' ? q.amountNano : '0', comment: memo, createdAt: now,
    expiresAt: useHeld ? Math.max(held.expiresAt, now + 10 * 60e3) : now + QUOTE_TTL_MS,
    method, stars: method === 'stars' ? q.stars : null, months, store,
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

// The buyer marks a code as redeemed (the app does it when they tap Redeem for it), or takes the mark off.
// Only a mark: the code itself never changes.
app.post('/api/orders/:id/codes/:index', telegramAuth, (req, res) => {
  const o = orders.get(req.params.id);
  if (!o || o.tg_user_id !== String(req.tgUser.id)) return res.status(404).json({ error: 'Order not found' });
  const i = Number(req.params.index);
  if (o.status !== 'delivered' || !Array.isArray(o.codes) || !Number.isInteger(i) || i < 0 || i >= o.codes.length) {
    return res.status(400).json({ error: 'No such code' });
  }
  const codes = o.codes.map((c, k) => (k === i ? { ...c, redeemedAt: req.body?.redeemed === false ? null : (c.redeemedAt || Date.now()) } : c));
  orders.update(o.id, { codes });
  res.json(publicOrder(orders.get(o.id)));
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
  // every price key of every product on sale; monthly plus yearly where the plan has one
  keys: () => enabledProducts().flatMap(priceKeys),
  name(k) {
    for (const p of enabledProducts()) for (const pl of p.plans) {
      if (pl.key === k) return `${p.name} ${pl.name}`;
      if (pl.yearlyKey === k) return `${p.name} ${pl.name}, yearly`;
    }
    return k;
  },
  list(region = STORE_REGION, store = 'appstore') {
    return this.keys().map((k) => ({ plan: k, name: this.name(k), price: inAppPrice(region, k, store), currency: REGIONS[region]?.currency, overridden: settings.get(overrideKey(region, k, store)) != null, source: priceSource(region, k, store) }));
  },
  set(region, plan, value, store = 'appstore') {
    if (!REGIONS[region]) return 'Unknown region';
    if (!this.keys().includes(plan)) return `Unknown plan. Use one of: ${this.keys().join(', ')}`;
    if (!(value > 0)) return 'Price must be a positive number';
    settings.set(overrideKey(region, plan, store), value);
    return null;
  },
  region: STORE_REGION,
  rate: () => rateStatus(),
};
startRateFeed();
const bot = startAdminBot({ getEngine: () => engine, orders, prices, publicUrl: process.env.PUBLIC_URL });

// Keep each product's in-app prices in step with the App Store (APPLE_PRICE_SYNC=off to stop it).
if (process.env.APPLE_PRICE_SYNC !== 'off') {
  for (const product of enabledProducts().filter((p) => p.appstore)) {
    startApplePriceSync({
      region: STORE_REGION,
      product: product.name,
      appId: product.appstore.appId,
      slug: product.appstore.slug,
      iap: product.appstore.iap,
      keys: () => Object.keys(product.appstore.iap), // all of them, so a new yearly plan is picked up too
      // compare against the App Store price we last synced (or the default), not an admin override
      get: (k) => Number(settings.get(`apple:${STORE_REGION}:${k}`) ?? REGIONS[STORE_REGION]?.prices?.[k]) || null,
      save: (k, v) => settings.set(`apple:${STORE_REGION}:${k}`, v),
      notify: (e) => bot.notify(e),
      url: process.env.APPLE_PAGE_URL, // tests point this at a fake page
    });
  }
}
const engine = createEngine({
  orders,
  payments,
  supplier: SUPPLIER,
  fetchIncoming: PAYMENT_MODE === 'chain' ? () => recentIncoming(MERCHANT, 100, flagRejected) : null,
  notify: (e) => bot.notify(e),
});

// A transfer with an order memo that the strict credit check rejected: tell a person once, never auto-pay.
function flagRejected(t) {
  const key = `rejected:${t.hash}`;
  if (settings.get(key)) return;
  settings.set(key, Date.now());
  console.warn(`[payments] unrecognised credit ${t.hash} memo ${t.comment}: ${t.reason}`);
  bot.notify({ type: 'credit_unrecognised', ...t, valueNano: String(t.valueNano), order: orders.byMemo(t.comment) });
}

// Instant detection via the streaming API; the poller catches anything the stream missed.
// While the stream is connected we poll every 15s; while it's down, every 5s.
let streamUp = false;
if (PAYMENT_MODE === 'chain' && process.env.TON_STREAM !== 'off') {
  startPaymentStream({
    merchant: MERCHANT,
    onPending: (t) => engine.seePending(t),
    onFinal: (t) => engine.applyTransfer(t).catch(console.error),
    onRejected: flagRejected,
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
