import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { extractPrices } from '../src/applePrices.js';
import { PRODUCTS, findPlan, priceKeys } from '../src/catalog.js';
import { openStore } from '../src/db.js';
import { createBot } from '../src/bot.js';

// A made-up second app, so these tests don't depend on which real products are in the catalog.
const NOTELY = {
  id: 'notely', name: 'Notely', app: 'Notely Notes',
  plans: [
    { id: 'notely_plus', key: 'notely_plus', yearlyKey: 'notely_plus_y', name: 'Plus', label: 'Plus', blurb: 'More notes' },
    { id: 'notely_team', key: 'notely_team', name: 'Team', label: 'Team', blurb: 'For teams' },
  ],
};
const NOTELY_IAP = {
  notely_plus: { name: /Notely\s+Plus\b/i, pick: 'min' },
  notely_plus_y: { name: /Notely\s+Plus\b/i, pick: 'max', yearlyOf: 'notely_plus' },
  notely_team: /Notely\s+Team\b/i,
};

test('catalog: plans belong to products, price keys are unique across products', () => {
  const keys = PRODUCTS.flatMap(priceKeys);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(findPlan('pro_m').product.id, 'claude');
  assert.equal(findPlan('pro_m').plan.label, 'Pro');
});

test('App Store page where monthly and yearly share a name: the cheaper is monthly, the dearer yearly', () => {
  const page = `<ul>${[['Notely Plus', '$9.99'], ['Notely Team', '$29.99'], ['100 Credits', '$4.00'], ['Notely Plus', '$99.99']]
    .map(([n, p]) => `<li><span>${n}</span><span>${p}</span></li>`).join('')}</ul>`;
  assert.deepEqual(extractPrices(page, NOTELY_IAP), { notely_plus: 9.99, notely_plus_y: 99.99, notely_team: 29.99 });
  // only one Plus listed: no yearly price is guessed
  assert.equal(extractPrices('<li>Notely Plus $9.99</li>', NOTELY_IAP).notely_plus_y, undefined);
  // a "yearly" price under 6x the monthly one is a misread, so it's dropped
  assert.equal(extractPrices('<li>Notely Plus $9.99</li><li>Notely Plus $19.99</li>', NOTELY_IAP).notely_plus_y, undefined);
});

test('admin: /prices play and /price play set Google Play prices separately', async () => {
  const calls = [];
  const store = {};
  const prices = {
    region: 'US',
    list: (r, s = 'appstore') => [{ plan: 'pro_m', name: 'Claude Pro', price: store[`${s}:pro_m`] ?? null, currency: 'USD', source: store[`${s}:pro_m`] ? 'set by you' : 'not set' }],
    set: (r, plan, v, s = 'appstore') => { store[`${s}:${plan}`] = v; return null; },
  };
  const bot = createBot({ api: async (m, b) => { calls.push(b); return {}; }, adminIds: ['1'], getEngine: () => null, orders: { get: () => null }, prices });
  const say = (text) => bot.handleUpdate({ message: { text, from: { id: 1 }, chat: { id: 1, type: 'private' } } });
  await say('/prices play');
  assert.match(calls.at(-1).text, /Google Play prices/);
  assert.match(calls.at(-1).text, /—/);
  await say('/price play pro_m 19.99');
  assert.equal(store['play:pro_m'], 19.99);
  assert.equal(store['appstore:pro_m'], undefined, 'App Store price untouched');
  await say('/price pro_m 21');
  assert.equal(store['appstore:pro_m'], 21);
});

// The real server with two products, and a Google Play price set for one Claude plan.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-mp-'));
const dbFile = path.join(dir, 'db.sqlite');
const seed = openStore(dbFile).settings;
seed.set('price:US:play:pro_m', 19.99);  // one Google Play price, for Claude Pro
seed.set('apple:US:notely_plus', 9.99);   // Notely's App Store prices, as if synced
seed.set('apple:US:notely_plus_y', 99.99);
seed.set('apple:US:notely_team', 29.99);
const PORT = 8944;
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: dbFile, PAYMENT_MODE: 'mock', BOT_TOKEN: '', SUPPLIER: 'mock', STORE_REGION: 'US', APPLE_PRICE_SYNC: 'off', PRODUCTS: 'claude,notely', EXTRA_PRODUCTS_JSON: JSON.stringify([NOTELY]) },
  stdio: 'ignore',
});
after(() => { srv.kill(); fs.rmSync(dir, { recursive: true, force: true }); });
const call = async (p, body) => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}${p}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
      return { status: r.status, body: await r.json() };
    } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};

test('API: both products on sale, each plan tagged with its product', async () => {
  const cfg = (await call('/api/config')).body;
  assert.deepEqual(cfg.products.map((p) => p.id), ['claude', 'notely']);
  const { body } = await call('/api/catalog');
  assert.deepEqual(body.plans.map((p) => p.id), ['pro_m', 'max5_m', 'max20_m', 'notely_plus', 'notely_team']);
  const plus = body.plans.find((p) => p.id === 'notely_plus');
  assert.equal(plus.product.name, 'Notely');
  assert.deepEqual(plus.terms.map((t) => t.months), [1, 3, 6, 12], 'a yearly price means a 1-year term');
  assert.equal(plus.terms.at(-1).appPrice, 99.99);
  const team = body.plans.find((p) => p.id === 'notely_team');
  assert.deepEqual(team.terms.map((t) => t.months), [1, 3, 6]);
});

test('API: Google Play shows only plans with a Play price set', async () => {
  const { body } = await call('/api/catalog?store=play');
  assert.equal(body.store, 'play');
  assert.deepEqual(body.storesPriced, { appstore: true, play: true });
  const available = body.plans.filter((p) => p.available).map((p) => p.id);
  assert.deepEqual(available, ['pro_m']);
  assert.deepEqual(body.plans.find((p) => p.id === 'pro_m').terms.map((t) => t.months), [1, 3, 6], 'no Play yearly price set');
});

test('API: a Google Play order keeps its store; a plan without a Play price is refused', async () => {
  const o = await call('/api/orders', { planId: 'pro_m', months: 1, store: 'play', method: 'gram' });
  assert.equal(o.status, 200);
  assert.equal(o.body.store.id, 'play');
  assert.equal(o.body.product.name, 'Claude');
  assert.equal(o.body.plan.label, 'Pro');
  const noPrice = await call('/api/orders', { planId: 'max5_m', months: 1, store: 'play', method: 'gram' });
  assert.equal(noPrice.status, 400, 'no Play price for Max 5x');
});
