// Real testnet payloads captured by Codex (request 001): a GRAM payment to a fresh (uninit)
// merchant wallet, as returned by TON Center v3 /transactions and by the streaming API.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { recentIncoming, unrecognisedCredit } from '../src/chain.js';
import { transfersFromNotification } from '../src/stream.js';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';

const load = (f) => JSON.parse(fs.readFileSync(new URL(`./fixtures/${f}`, import.meta.url), 'utf8'));
const v3 = load('v3-fresh-wallet-credit.json');
const stream = load('stream-fresh-wallet-credit.json');
const MERCHANT = '0QBYUd6v5L6ywkxEQLik5I1r0iq-0RUdHR5mdG15srMRcH-I';
const MEMO = 'TS-628AF91308';
const VALUE = 209933333n;
const pollerOver = async (t, txs, onRejected) => {
  t.mock.method(globalThis, 'fetch', async () => Response.json({ transactions: txs }));
  return recentIncoming(MERCHANT, 100, onRejected);
};

test('real v3 payload: the poller accepts the fresh-wallet credit', async (t) => {
  const [tr, ...rest] = await pollerOver(t, [v3]);
  assert.equal(rest.length, 0);
  assert.equal(tr.comment, MEMO);
  assert.equal(tr.valueNano, VALUE);
});

test('real stream payload: accepted, memo decoded from the raw body (no pre-decoded comment)', () => {
  assert.equal(stream.transactions[0].in_msg.message_content.decoded, null);
  const [tr, ...rest] = transfersFromNotification(stream, MERCHANT);
  assert.equal(rest.length, 0);
  assert.equal(tr.comment, MEMO);
  assert.equal(tr.valueNano, VALUE);
  assert.equal(tr.finality, 'finalized');
});

test('both readers produce the same hash, so a credit seen twice buys once', async (t) => {
  const [a] = await pollerOver(t, [v3]);
  const [b] = transfersFromNotification(stream, MERCHANT);
  assert.equal(a.hash, b.hash);

  const { orders, payments } = openStore(':memory:');
  let bought = 0;
  const engine = createEngine({ orders, payments, log: {}, notify: () => {}, supplier: { purchase: async ({ packages }) => { bought++; return packages.map((p) => ({ code: 'C', value: p.value })); } } });
  orders.insert({ id: 'o', tgUserId: '1', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }], faceValue: 22, currency: 'USD', costUsd: 22, amountNano: String(VALUE), comment: MEMO, createdAt: Date.now(), expiresAt: Date.now() + 1e6 });
  assert.equal(await engine.applyTransfer(b), 'paid');
  assert.equal(await engine.applyTransfer(a), 'seen');
  assert.equal(orders.get('o').status, 'delivered');
  assert.equal(bought, 1);
});

test('the real credit is never also reported as unrecognised', async (t) => {
  const flagged = [];
  await pollerOver(t, [v3], (r) => flagged.push(r));
  transfersFromNotification(stream, MERCHANT, (r) => flagged.push(r));
  assert.equal(unrecognisedCredit(v3, MERCHANT), null);
  assert.deepEqual(flagged, []);
});

// Review finding 1 on PR #1: anything the strict check rejects must reach a person, not vanish.
const variant = (mutate) => { const t = structuredClone(v3); mutate(t); return t; };
test('a memo credit the strict check rejects is flagged, never paid', async (t) => {
  const missingField = variant((x) => { delete x.description.destroyed; });
  const activeAccount = variant((x) => { x.end_status = 'active'; });
  for (const tx of [missingField, activeAccount]) {
    const flagged = [];
    assert.deepEqual(await pollerOver(t, [tx], (r) => flagged.push(r)), []);
    assert.equal(flagged.length, 1);
    assert.equal(flagged[0].comment, MEMO);
    assert.equal(flagged[0].valueNano, VALUE);
    assert.match(flagged[0].reason, /not recognised/);
  }
});

test('the stream only flags finalized rejections', () => {
  const tx = variant((x) => { x.end_status = 'active'; });
  const flagged = [];
  transfersFromNotification({ ...stream, finality: 'pending', transactions: [tx] }, MERCHANT, (r) => flagged.push(r));
  assert.equal(flagged.length, 0);
  transfersFromNotification({ ...stream, transactions: [tx] }, MERCHANT, (r) => flagged.push(r));
  assert.equal(flagged.length, 1);
});

test('bounced messages, other accounts and memo-less transfers are not flagged', () => {
  assert.equal(unrecognisedCredit(variant((x) => { x.in_msg.bounced = true; x.end_status = 'active'; }), MERCHANT), null);
  assert.equal(unrecognisedCredit(variant((x) => { x.account = '0:' + 'ef'.repeat(32); }), MERCHANT), null);
  const noMemo = variant((x) => { x.end_status = 'active'; x.in_msg.message_content = { body: null, decoded: { type: 'text_comment', comment: 'hello' } }; });
  assert.equal(unrecognisedCredit(noMemo, MERCHANT), null);
  const bouncedBack = unrecognisedCredit(variant((x) => { x.end_status = 'active'; x.description.bounce = { type: 'ok' }; }), MERCHANT);
  assert.match(bouncedBack.reason, /bounced back/);
});

test('admin bot: unrecognised credit alert names the memo, amount and tx', async () => {
  const { createBot } = await import('../src/bot.js');
  const calls = [];
  const bot = createBot({ api: async (m, b) => { calls.push(b); return {}; }, adminIds: ['1'], getEngine: () => null, orders: { get: () => null }, prices: null });
  await bot.notify({ type: 'credit_unrecognised', hash: 'H1', comment: MEMO, valueNano: String(VALUE), source: 'S', reason: 'not recognised as a completed credit', order: null });
  assert.equal(calls.length, 1);
  assert.match(calls[0].text, /Payment not recognised/);
  assert.match(calls[0].text, new RegExp(MEMO));
  assert.match(calls[0].text, /0\.21 GRAM/);
  assert.match(calls[0].text, /H1/);
});
