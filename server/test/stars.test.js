import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';
import { createBot } from '../src/bot.js';

function setup() {
  const { orders, payments } = openStore(':memory:');
  const events = [];
  let bought = 0;
  const clock = { t: Date.UTC(2026, 9, 30) };
  const engine = createEngine({
    orders, payments, log: {}, now: () => clock.t, notify: (e) => events.push(e),
    supplier: { purchase: async ({ packages }) => { bought++; return packages.map((p) => ({ code: 'CODE' + bought, value: p.value })); } },
  });
  const add = (id, extra = {}) => orders.insert({
    id, tgUserId: '42', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }], faceValue: 22, currency: 'USD',
    costUsd: 22, amountNano: '0', comment: 'TS-' + id, createdAt: clock.t, expiresAt: clock.t + 20 * 60e3, method: 'stars', stars: 1830, ...extra,
  });
  return { orders, payments, engine, events, clock, add, bought: () => bought };
}

test('pre-checkout approves only the right buyer, amount and a live price', () => {
  const { engine, add, clock } = setup();
  add('a');
  assert.equal(engine.checkStars({ orderId: 'a', amount: 1830, userId: 42 }), null);
  assert.match(engine.checkStars({ orderId: 'a', amount: 1000, userId: 42 }), /amount/);
  assert.match(engine.checkStars({ orderId: 'a', amount: 1830, userId: 7 }), /someone else/);
  assert.match(engine.checkStars({ orderId: 'nope', amount: 1830, userId: 42 }), /no longer exists/);
  clock.t += 21 * 60e3;
  assert.match(engine.checkStars({ orderId: 'a', amount: 1830, userId: 42 }), /expired/);
});

test('a Stars payment delivers once, even if Telegram reports it twice', async () => {
  const { engine, add, orders, bought } = setup();
  add('a');
  assert.equal(await engine.applyStars({ orderId: 'a', amount: 1830, chargeId: 'c1', userId: 42 }), 'paid');
  assert.equal(await engine.applyStars({ orderId: 'a', amount: 1830, chargeId: 'c1', userId: 42 }), 'seen');
  assert.equal(orders.get('a').status, 'delivered');
  assert.equal(orders.get('a').charge_id, 'c1');
  assert.equal(bought(), 1);
});

test('GRAM sent with a Stars order memo never pays for it', async () => {
  const { engine, add, orders, events } = setup();
  add('a');
  assert.equal(await engine.applyTransfer({ hash: 'h', comment: 'TS-a', valueNano: 5n * 10n ** 9n, source: 'x' }), 'extra');
  assert.equal(orders.get('a').status, 'awaiting_payment');
  assert.equal(events.at(-1).type, 'extra');
});

test('a wrong Stars amount goes to a person instead of buying', async () => {
  const { engine, add, orders, events, bought } = setup();
  add('a');
  assert.equal(await engine.applyStars({ orderId: 'a', amount: 5, chargeId: 'c2', userId: 42 }), 'extra');
  assert.equal(orders.get('a').status, 'awaiting_payment');
  assert.equal(bought(), 0);
  assert.equal(events.at(-1).stars, 5);
});

test('bot: pre-checkout, payment, and a real Stars refund', async () => {
  const { engine, add, orders } = setup();
  const calls = [];
  const api = async (method, body) => { calls.push({ method, body }); return method === 'createInvoiceLink' ? 'https://t.me/$inv' : {}; };
  const bot = createBot({ api, adminIds: ['1'], getEngine: () => engine, orders, prices: null });

  add('a');
  assert.equal(await bot.createInvoice(orders.get('a')), 'https://t.me/$inv');
  const inv = calls.find((c) => c.method === 'createInvoiceLink').body;
  assert.equal(inv.currency, 'XTR');
  assert.equal(inv.prices[0].amount, 1830);
  assert.doesNotMatch(inv.title + inv.description, /gift/i);

  await bot.handleUpdate({ pre_checkout_query: { id: 'q', currency: 'XTR', total_amount: 1830, invoice_payload: 'a', from: { id: 42 } } });
  assert.deepEqual(calls.at(-1), { method: 'answerPreCheckoutQuery', body: { pre_checkout_query_id: 'q', ok: true } });

  // payment arrives but the supplier fails: admin refunds the Stars for real
  add('b');
  const failing = createEngine({ orders, payments: openStore(':memory:').payments, log: {}, notify: () => {}, supplier: { purchase: async () => { throw new Error('down'); } } });
  const bot2 = createBot({ api, adminIds: ['1'], getEngine: () => failing, orders, prices: null });
  await bot2.handleUpdate({ message: { from: { id: 42 }, chat: { id: 42 }, successful_payment: { currency: 'XTR', total_amount: 1830, invoice_payload: 'b', telegram_payment_charge_id: 'ch_b' } } });
  assert.equal(orders.get('b').status, 'failed');
  const msg = { chat: { id: 1 }, message_id: 9 };
  await bot2.handleUpdate({ callback_query: { id: 'k', from: { id: 1 }, message: msg, data: 'fc:b' } });
  const refund = calls.find((c) => c.method === 'refundStarPayment');
  assert.deepEqual(refund.body, { user_id: 42, telegram_payment_charge_id: 'ch_b' });
  assert.equal(orders.get('b').status, 'refunded');
});

test('a delivered Stars order cannot be refunded from the bot', async () => {
  const { engine, add, orders } = setup();
  const calls = [];
  const bot = createBot({ api: async (m, b) => { calls.push({ m, b }); return {}; }, adminIds: ['1'], getEngine: () => engine, orders, prices: null });
  add('a');
  await engine.applyStars({ orderId: 'a', amount: 1830, chargeId: 'c1', userId: 42 });
  await bot.handleUpdate({ callback_query: { id: 'k', from: { id: 1 }, message: { chat: { id: 1 }, message_id: 1 }, data: 'fc:a' } });
  assert.ok(!calls.some((c) => c.m === 'refundStarPayment'));
  assert.equal(orders.get('a').status, 'delivered');
});
