import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/db.js';
import { createEngine, LATE_MS } from '../src/engine.js';

const GRAM = 1_000_000_000n;

function setup({ supplierFails = false } = {}) {
  const { orders, payments } = openStore(':memory:');
  let clock = 1_000_000;
  const events = [];
  let purchases = 0;
  const incoming = [];
  const supplier = {
    async purchase({ packages }) {
      purchases++;
      if (supplierFails) throw new Error('supplier down');
      return packages.map((p) => ({ code: `CODE${purchases}`, value: p.value }));
    },
  };
  const engine = createEngine({
    orders, payments, supplier,
    fetchIncoming: async () => [...incoming].reverse(), // toncenter returns newest first
    notify: (e) => events.push(e),
    now: () => clock,
    log: {},
  });
  const order = (memo = 'TS-AAA', gram = 10n) => {
    orders.insert({
      id: `id-${memo}`, tgUserId: '42', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }],
      faceValue: 22, currency: 'USD', costUsd: 22, amountNano: String(gram * GRAM), comment: memo,
      createdAt: clock, expiresAt: clock + 20 * 60e3,
    });
    return `id-${memo}`;
  };
  const pay = (hash, memo, gram) => incoming.push({ hash, comment: memo, valueNano: BigInt(Math.round(gram * 1e9)), source: 'EQsender' });
  return { orders, payments, engine, events, order, pay, advance: (ms) => { clock += ms; }, purchases: () => purchases };
}

test('exact payment is matched and fulfilled once', async () => {
  const t = setup();
  const id = t.order();
  t.pay('h1', 'TS-AAA', 10);
  await t.engine.tick();
  await t.engine.tick(); // same tx seen again must not double-buy
  const o = t.orders.get(id);
  assert.equal(o.status, 'delivered');
  assert.equal(o.tx_hash, 'h1');
  assert.equal(t.purchases(), 1);
  assert.deepEqual(t.events.map((e) => e.type), ['delivered']);
});

test('memo with surrounding whitespace still matches', async () => {
  const t = setup();
  const id = t.order();
  t.pay('h1', '  TS-AAA \n', 10);
  await t.engine.tick();
  assert.equal(t.orders.get(id).status, 'delivered');
});

test('underpayment waits, then a top-up with the same memo completes it', async () => {
  const t = setup();
  const id = t.order();
  t.pay('h1', 'TS-AAA', 6);
  await t.engine.tick();
  let o = t.orders.get(id);
  assert.equal(o.status, 'underpaid');
  assert.equal(o.received_nano, String(6n * GRAM));
  assert.match(o.error, /remaining 4\.00 GRAM/);
  t.pay('h2', 'TS-AAA', 4);
  await t.engine.tick();
  o = t.orders.get(id);
  assert.equal(o.status, 'delivered');
  assert.equal(t.purchases(), 1);
  assert.deepEqual(t.events.map((e) => e.type), ['underpaid', 'delivered']);
});

test('overpayment is accepted', async () => {
  const t = setup();
  const id = t.order();
  t.pay('h1', 'TS-AAA', 12.5);
  await t.engine.tick();
  assert.equal(t.orders.get(id).status, 'delivered');
});

test('late payment within the window is honoured; after it, flagged for a person', async () => {
  const t = setup();
  const a = t.order('TS-LATE1');
  const b = t.order('TS-LATE2');
  t.advance(25 * 60e3);
  await t.engine.tick();
  assert.equal(t.orders.get(a).status, 'expired');
  t.pay('h1', 'TS-LATE1', 10);
  await t.engine.tick();
  assert.equal(t.orders.get(a).status, 'delivered');

  t.advance(LATE_MS + 60e3);
  t.pay('h2', 'TS-LATE2', 10);
  await t.engine.tick();
  assert.equal(t.orders.get(b).status, 'expired');
  assert.ok(t.events.some((e) => e.type === 'extra' && e.order.id === b));
});

test('paying twice for a delivered order alerts instead of buying again', async () => {
  const t = setup();
  const id = t.order();
  t.pay('h1', 'TS-AAA', 10);
  await t.engine.tick();
  t.pay('h2', 'TS-AAA', 10);
  await t.engine.tick();
  assert.equal(t.purchases(), 1);
  assert.ok(t.events.some((e) => e.type === 'extra' && e.hash === 'h2'));
  assert.match(t.orders.get(id).admin_note, /Extra payment 10\.00 GRAM/);
});

test('unknown TS- memo is reported; random transfers are ignored quietly', async () => {
  const t = setup();
  t.pay('h1', 'TS-NOPE', 3);
  t.pay('h2', 'hello', 1);
  t.pay('h3', null, 1);
  await t.engine.tick();
  assert.deepEqual(t.events.map((e) => e.type), ['unmatched']);
});

test('supplier failure → failed + alert; retry delivers; refund blocked once delivered', async () => {
  const t = setup({ supplierFails: true });
  const id = t.order();
  t.pay('h1', 'TS-AAA', 10);
  await t.engine.tick();
  assert.equal(t.orders.get(id).status, 'failed');
  assert.equal(t.events.at(-1).type, 'failed');

  const stillFailing = await t.engine.retry(id);
  assert.equal(stillFailing.ok, false);
  assert.equal(t.orders.get(id).status, 'failed');
});

test('retry after the supplier recovers', async () => {
  const t = setup({ supplierFails: true });
  const id = t.order();
  t.pay('h1', 'TS-AAA', 10);
  await t.engine.tick();
  // swap in a working supplier by re-creating the engine on the same store
  const engine2 = createEngine({
    orders: t.orders, payments: t.payments, log: {},
    supplier: { purchase: async ({ packages }) => packages.map((p) => ({ code: 'OK', value: p.value })) },
  });
  const r = await engine2.retry(id);
  assert.equal(r.ok, true);
  assert.equal(t.orders.get(id).status, 'delivered');
  const refund = engine2.markRefunded(id);
  assert.equal(refund.ok, false);
});

test('mark refunded on an underpaid order', async () => {
  const t = setup();
  const id = t.order();
  t.pay('h1', 'TS-AAA', 2);
  await t.engine.tick();
  const r = t.engine.markRefunded(id, 'sent back 2 GRAM');
  assert.equal(r.ok, true);
  assert.equal(t.orders.get(id).status, 'refunded');
  // a top-up after refund is not applied
  t.pay('h2', 'TS-AAA', 8);
  await t.engine.tick();
  assert.equal(t.orders.get(id).status, 'refunded');
  assert.equal(t.purchases(), 0);
});

test('resume: interrupted purchases go to a person instead of being re-bought', async () => {
  const t = setup();
  const a = t.order('TS-A');
  const b = t.order('TS-B');
  t.orders.transition(a, 'awaiting_payment', 'paid');
  t.orders.transition(b, 'awaiting_payment', 'fulfilling');
  await t.engine.resume();
  assert.equal(t.orders.get(a).status, 'delivered');
  assert.equal(t.orders.get(b).status, 'failed');
  assert.equal(t.purchases(), 1);
});
