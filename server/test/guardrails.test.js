import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';
import { createBot } from '../src/bot.js';
import { gramUsd, _setRateForTests, RATE_MAX_AGE_MS } from '../src/chain.js';

test('a fresh rate is used; a stale one is refused unless allowed', async () => {
  _setRateForTests(1.25);
  assert.equal(await gramUsd(), 1.25);
  _setRateForTests(1.25, Date.now() - RATE_MAX_AGE_MS - 1000);
  assert.equal(await gramUsd(), null);
  assert.equal(await gramUsd({ allowStale: true }), 1.25);
});

test('renewal reminders go out once, ~27 days after delivery', async () => {
  const { orders, payments } = openStore(':memory:');
  let clock = Date.UTC(2026, 9, 1);
  const events = [];
  const engine = createEngine({
    orders, payments, log: {}, now: () => clock, notify: (e) => events.push(e),
    supplier: { purchase: async ({ packages }) => packages.map((p) => ({ code: 'C', value: p.value })) },
  });
  orders.insert({ id: 'o', tgUserId: '42', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }], faceValue: 22, currency: 'USD', costUsd: 22, amountNano: '1', comment: 'TS-R', createdAt: clock, expiresAt: clock + 1e6 });
  orders.transition('o', 'awaiting_payment', 'paid');
  await engine.fulfil('o');
  clock += 20 * 86400e3;
  assert.equal(engine.remindRenewals(), 0);
  clock += 8 * 86400e3;
  assert.equal(engine.remindRenewals(), 1);
  assert.equal(engine.remindRenewals(), 0);
  assert.equal(events.filter((e) => e.type === 'renewal').length, 1);
});

test('/prices and /price let the admin change what we sell against', async () => {
  const { settings } = openStore(':memory:');
  const calls = [];
  const api = async (method, body) => { calls.push({ method, body }); return {}; };
  const base = { pro_m: 20, max5_m: 124.99 };
  const prices = {
    region: 'US',
    list: () => Object.keys(base).map((plan) => ({ plan, name: plan, price: Number(settings.get(`price:US:${plan}`) ?? base[plan]), currency: 'USD', overridden: settings.get(`price:US:${plan}`) != null })),
    set: (r, plan, v) => (!base[plan] ? 'Unknown plan' : !(v > 0) ? 'Price must be a positive number' : (settings.set(`price:${r}:${plan}`, v), null)),
  };
  const bot = createBot({ api, adminIds: ['1'], getEngine: () => null, orders: { get: () => null }, prices });
  const say = (text, from = 1) => bot.handleUpdate({ message: { text, from: { id: from }, chat: { id: from } } });

  await say('/price max5_m 129.99');
  assert.equal(settings.get('price:US:max5_m'), '129.99');
  await say('/price max5_m -3');
  assert.match(calls.at(-1).body.text, /positive/);
  await say('/prices');
  assert.match(calls.at(-1).body.text, /129\.99 USD<\/b> \(set by you\)/);
  await say('/price pro_m 1', 2); // not an admin
  assert.equal(settings.get('price:US:pro_m'), null);
});

test('support inbox: buyer message reaches admins, admin reply reaches buyer', async () => {
  const { orders } = openStore(':memory:');
  const calls = [];
  const api = async (method, body) => { calls.push({ method, body }); return {}; };
  const bot = createBot({ api, adminIds: ['1'], getEngine: () => null, orders, prices: null });
  await bot.handleUpdate({ message: { text: 'my code did not arrive', from: { id: 42, first_name: 'Ana' }, chat: { id: 42, type: 'private' } } });
  const alert = calls.find((c) => c.body.chat_id === '1');
  assert.match(alert.body.text, /#u42/);
  assert.match(alert.body.text, /my code did not arrive/);
  assert.match(calls.at(-1).body.text, /A person will reply/);
  await bot.handleUpdate({ message: { text: 'Fixed, check the app', from: { id: 1 }, chat: { id: 1, type: 'private' }, reply_to_message: { text: alert.body.text.replace(/<[^>]+>/g, '') } } });
  const answer = calls.find((c) => c.body.chat_id === '42' && /Fixed/.test(c.body.text));
  assert.ok(answer, 'buyer got the reply');
  await bot.handleUpdate({ message: { text: '/terms', from: { id: 42 }, chat: { id: 42, type: 'private' } } });
  assert.match(calls.at(-1).body.text, /cannot be refunded/);
});
