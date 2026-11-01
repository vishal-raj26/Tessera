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

const chatgpt = PRODUCTS.find((p) => p.id === 'chatgpt');

test('catalog: plans belong to products, price keys are unique across products', () => {
  const keys = PRODUCTS.flatMap(priceKeys);
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(findPlan('pro_m').product.id, 'claude');
  assert.equal(findPlan('chatgpt_plus').product.name, 'ChatGPT');
});

test('ChatGPT page: Plus monthly and yearly share a name; the cheaper is monthly, the dearer yearly', () => {
  const page = `<ul>${[['ChatGPT Plus', '$19.99'], ['ChatGPT Go', '$8.00'], ['ChatGPT Pro 100', '$100.00'], ['100 Credits', '$4.00'],
    ['ChatGPT Pro 200', '$200.00'], ['ChatGPT Plus', '$200.00'], ['ChatGPT Pro 500', '$500.00']].map(([n, p]) => `<li><span>${n}</span><span>${p}</span></li>`).join('')}</ul>`;
  assert.deepEqual(extractPrices(page, chatgpt.appstore.iap), { chatgpt_go: 8, chatgpt_plus: 19.99, chatgpt_plus_y: 200, chatgpt_pro: 200 });
  // only one Plus listed: no yearly price is guessed
  const one = '<li>ChatGPT Plus $19.99</li><li>ChatGPT Go $8.00</li>';
  assert.equal(extractPrices(one, chatgpt.appstore.iap).chatgpt_plus_y, undefined);
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
openStore(dbFile).settings.set('price:US:play:pro_m', 19.99);
const PORT = 8944;
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: dbFile, PAYMENT_MODE: 'mock', BOT_TOKEN: '', SUPPLIER: 'mock', STORE_REGION: 'US', APPLE_PRICE_SYNC: 'off', PRODUCTS: 'claude,chatgpt' },
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
  assert.deepEqual(cfg.products.map((p) => p.id), ['claude', 'chatgpt']);
  const { body } = await call('/api/catalog');
  assert.deepEqual(body.plans.map((p) => p.id), ['pro_m', 'max5_m', 'max20_m', 'chatgpt_go', 'chatgpt_plus', 'chatgpt_pro']);
  const plus = body.plans.find((p) => p.id === 'chatgpt_plus');
  assert.equal(plus.product.name, 'ChatGPT');
  assert.deepEqual(plus.terms.map((t) => t.months), [1, 3, 6, 12], 'ChatGPT Plus has a yearly plan');
  assert.equal(plus.terms.at(-1).appPrice, 200);
});

test('API: Google Play shows only plans with a Play price set', async () => {
  const { body } = await call('/api/catalog?store=play');
  assert.equal(body.store, 'play');
  assert.deepEqual(body.storesPriced, { appstore: true, play: true });
  const available = body.plans.filter((p) => p.available).map((p) => p.id);
  assert.deepEqual(available, ['pro_m']);
  assert.deepEqual(body.plans.find((p) => p.id === 'pro_m').terms.map((t) => t.months), [1, 3, 6], 'no Play yearly price set');
});

test('API: a Google Play order keeps its store; a plan not on sale is refused', async () => {
  const o = await call('/api/orders', { planId: 'pro_m', months: 1, store: 'play', method: 'gram' });
  assert.equal(o.status, 200);
  assert.equal(o.body.store.id, 'play');
  assert.equal(o.body.product.name, 'Claude');
  assert.equal(o.body.plan.label, 'Pro');
  const noPrice = await call('/api/orders', { planId: 'max5_m', months: 1, store: 'play', method: 'gram' });
  assert.equal(noPrice.status, 400, 'no Play price for Max 5x');
});
