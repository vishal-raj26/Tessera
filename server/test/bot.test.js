import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';
import { createBot } from '../src/bot.js';

function setup() {
  const { orders, payments } = openStore(':memory:');
  const calls = [];
  const api = async (method, body) => { calls.push({ method, body }); return {}; };
  let fail = true;
  const engine = createEngine({
    orders, payments, log: {},
    supplier: { purchase: async ({ packages }) => { if (fail) throw new Error('down'); return packages.map((p) => ({ code: 'C', value: p.value })); } },
  });
  const bot = createBot({ api, adminIds: ['100'], getEngine: () => engine, orders, publicUrl: 'https://app.example' });
  orders.insert({
    id: 'o1', tgUserId: '42', region: 'US', planId: 'max5_m', packages: [{ id: 'p', value: 140 }], faceValue: 140,
    currency: 'USD', costUsd: 140, amountNano: '102820000000', comment: 'TS-X', createdAt: 1, expiresAt: Date.now() + 1e6,
  });
  return { orders, engine, bot, calls, recover: () => { fail = false; } };
}

const cb = (data, from = '100') => ({ callback_query: { id: 'cq', data, from: { id: from }, message: { chat: { id: from }, message_id: 7 } } });

test('failed order: admin gets buttons, buyer gets a heads-up', async () => {
  const t = setup();
  t.orders.transition('o1', 'awaiting_payment', 'paid');
  await t.engine.fulfil('o1');
  await t.bot.notify({ type: 'failed', order: t.orders.get('o1'), reason: 'down' });
  const toAdmin = t.calls.find((c) => c.method === 'sendMessage' && c.body.chat_id === '100');
  const toBuyer = t.calls.find((c) => c.method === 'sendMessage' && c.body.chat_id === '42');
  assert.ok(toAdmin.body.text.includes('Fulfilment failed'));
  assert.deepEqual(toAdmin.body.reply_markup.inline_keyboard[0].map((b) => b.text), ['Retry', 'Mark refunded']);
  assert.ok(toBuyer.body.text.includes('taking longer'));
  assert.equal(toBuyer.body.reply_markup.inline_keyboard[0][0].web_app.url, 'https://app.example');
});

test('Retry button re-runs fulfilment', async () => {
  const t = setup();
  t.orders.transition('o1', 'awaiting_payment', 'paid');
  await t.engine.fulfil('o1');
  t.recover();
  await t.bot.handleUpdate(cb('r:o1'));
  assert.equal(t.orders.get('o1').status, 'delivered');
  const ans = t.calls.find((c) => c.method === 'answerCallbackQuery');
  assert.equal(ans.body.text, 'Delivered');
});

test('Refund needs a confirmation tap', async () => {
  const t = setup();
  t.orders.transition('o1', 'awaiting_payment', 'underpaid');
  await t.bot.handleUpdate(cb('f:o1'));
  assert.equal(t.orders.get('o1').status, 'underpaid');
  const edit = t.calls.find((c) => c.method === 'editMessageReplyMarkup');
  assert.equal(edit.body.reply_markup.inline_keyboard[0][0].callback_data, 'fc:o1');
  await t.bot.handleUpdate(cb('fc:o1'));
  assert.equal(t.orders.get('o1').status, 'refunded');
});

test('non-admins cannot press buttons or use commands', async () => {
  const t = setup();
  t.orders.transition('o1', 'awaiting_payment', 'underpaid');
  await t.bot.handleUpdate(cb('fc:o1', '999'));
  assert.equal(t.orders.get('o1').status, 'underpaid');
  await t.bot.handleUpdate({ message: { text: '/issues', from: { id: 999 }, chat: { id: 999 } } });
  assert.ok(!t.calls.some((c) => c.method === 'sendMessage' && c.body.chat_id === '999'));
});

test('/issues lists orders that need attention', async () => {
  const t = setup();
  t.orders.transition('o1', 'awaiting_payment', 'underpaid');
  await t.bot.handleUpdate({ message: { text: '/issues', from: { id: 100 }, chat: { id: 100 } } });
  const msg = t.calls.find((c) => c.method === 'sendMessage');
  assert.ok(msg.body.text.includes('TS-X'));
  assert.ok(msg.body.text.includes('underpaid'));
});
