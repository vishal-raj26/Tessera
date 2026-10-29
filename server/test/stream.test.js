import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Address } from '@ton/core';
import { transfersFromNotification } from '../src/stream.js';
import { commentPayload } from '../src/chain.js';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';

const merchantRaw = '0:' + 'cd'.repeat(32);
const merchant = Address.parse(merchantRaw).toString({ bounceable: false });

const note = (finality, txs) => ({ type: 'transactions', finality, trace_external_hash_norm: 'X', transactions: txs });
const incoming = (hash, memo, value, extra = {}) => ({
  hash, account: merchantRaw,
  in_msg: { source: '0:' + '11'.repeat(32), destination: merchantRaw, value: String(value), message_content: { body: commentPayload(memo) } },
  description: { aborted: false }, ...extra,
});

test('extracts incoming transfers to the merchant from a notification', () => {
  const n = note('finalized', [
    incoming('h1', 'TS-A', 5e9),
    { ...incoming('h2', 'TS-B', 1e9), account: '0:' + 'ee'.repeat(32) }, // someone else's tx in the same trace
    incoming('h3', 'TS-C', 1e9, { description: { aborted: true } }),
    { hash: 'h4', account: merchantRaw, description: {} }, // no in_msg (external)
  ]);
  const t = transfersFromNotification(n, merchant);
  assert.deepEqual(t.map((x) => [x.hash, x.comment, x.finality]), [['h1', 'TS-A', 'finalized']]);
  assert.equal(t[0].valueNano, 5_000_000_000n);
});

test('ignores other event types', () => {
  assert.deepEqual(transfersFromNotification({ status: 'subscribed' }, merchant), []);
  assert.deepEqual(transfersFromNotification({ type: 'account_state_change' }, merchant), []);
});

test('pending marks the order as seen without paying; finalized pays', async () => {
  const { orders, payments } = openStore(':memory:');
  let bought = 0;
  const engine = createEngine({ orders, payments, log: {}, supplier: { purchase: async ({ packages }) => { bought++; return packages.map((p) => ({ code: 'C', value: p.value })); } } });
  orders.insert({ id: 'o', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }], faceValue: 22, currency: 'USD', costUsd: 22, amountNano: '5000000000', comment: 'TS-A', createdAt: 1, expiresAt: Date.now() + 1e6 });

  const [pending] = transfersFromNotification(note('pending', [incoming('h1', 'TS-A', 5e9)]), merchant);
  engine.seePending(pending);
  assert.ok(orders.get('o').seen_at);
  assert.equal(orders.get('o').status, 'awaiting_payment');
  assert.equal(bought, 0);

  const [final] = transfersFromNotification(note('finalized', [incoming('h1', 'TS-A', 5e9)]), merchant);
  await engine.applyTransfer(final);
  await engine.applyTransfer(final); // the poller seeing it again changes nothing
  assert.equal(orders.get('o').status, 'delivered');
  assert.equal(bought, 1);
});
