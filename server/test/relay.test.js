import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';
import { createRelay, readStatus, TON_CHAIN } from '../src/relay.js';

const GRAM = 1_000_000_000n;

// a fake Relay API: its chain list, quotes (recorded) and deposit-address request records
function fakeRelay({ requests = [], quoteStatus = 200 } = {}) {
  const calls = [];
  const chains = [
    { id: 8453, vmType: 'evm', depositEnabled: true, currency: { address: '0x0000000000000000000000000000000000000000', decimals: 18, symbol: 'ETH' }, erc20Currencies: [{ symbol: 'USDC', address: '0xusdc', decimals: 6 }] },
    { id: 792703809, vmType: 'svm', depositEnabled: true, currency: { address: '11111111111111111111111111111111', decimals: 9, symbol: 'SOL' }, erc20Currencies: [], solverCurrencies: [{ symbol: 'USDC', address: 'EPjF', decimals: 6 }] },
    { id: TON_CHAIN, vmType: 'tonvm', depositEnabled: true, currency: { address: 'EQ-native-gram', decimals: 9, symbol: 'GRAM' } },
  ];
  const fetchImpl = async (url, init = {}) => {
    const u = new URL(url);
    calls.push({ path: u.pathname, query: u.search, body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    if (u.pathname === '/chains') return json(200, { chains });
    if (u.pathname.startsWith('/quote')) {
      if (quoteStatus !== 200) return json(quoteStatus, { message: 'nope' });
      const b = JSON.parse(init.body);
      return json(200, {
        requestId: '0xreq',
        steps: [{ id: 'deposit', depositAddress: b.useDepositAddress ? { address: '0xDEPOSIT', type: 'strict' } : undefined }],
        details: { currencyIn: { amount: '9615119', amountFormatted: '9.615119', amountUsd: '9.61', currency: { decimals: 6 } } },
        fees: { relayer: { amountUsd: '0.04' } },
      });
    }
    if (u.pathname === '/requests/v3') return json(200, { requests });
    return json(404, {});
  };
  return { fetchImpl, calls };
}

test('live deposit: exact GRAM out, strict one-time address, refund to the sender', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'live', fetchImpl: f.fetchImpl });
  const d = await relay.createDeposit({ routeKey: 'usdc-base', gramNano: String(10n * GRAM), recipient: 'EQmerchant' });
  assert.equal(d.address, '0xDEPOSIT');
  assert.equal(d.amountFormatted, '9.615119');
  assert.equal(d.coin, 'USDC');
  const q = f.calls.find((c) => c.path.startsWith('/quote'));
  assert.equal(q.path, '/quote/v2'); // no API key
  assert.equal(q.body.tradeType, 'EXACT_OUTPUT');
  assert.equal(q.body.amount, String(10n * GRAM));
  assert.equal(q.body.destinationChainId, TON_CHAIN);
  assert.equal(q.body.destinationCurrency, 'EQ-native-gram');
  assert.equal(q.body.recipient, 'EQmerchant');
  assert.equal(q.body.useDepositAddress, true);
  assert.equal(q.body.strict, true);
  assert.equal(q.body.refundTo, '0x0000000000000000000000000000000000000000');
});

test('with an API key: /quote/v3, the key header, and Solana routes', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'live', apiKey: 'k', fetchImpl: f.fetchImpl });
  const keys = (await relay.options()).map((o) => o.key);
  assert.ok(keys.includes('usdc-solana'));
  await relay.createDeposit({ routeKey: 'usdc-solana', gramNano: '1', recipient: 'EQm' });
  const q = f.calls.find((c) => c.path.startsWith('/quote'));
  assert.equal(q.path, '/quote/v3');
  assert.equal(q.headers['x-api-key'], 'k');
  assert.equal(q.body.refundTo, '11111111111111111111111111111111');
});

test('without a key, live mode offers only routes that work without one', async () => {
  const relay = createRelay({ mode: 'live', fetchImpl: fakeRelay().fetchImpl });
  const keys = (await relay.options()).map((o) => o.key);
  assert.ok(keys.includes('usdc-base'));
  assert.ok(!keys.includes('usdc-solana'));
  await assert.rejects(relay.createDeposit({ routeKey: 'usdc-solana', gramNano: '1', recipient: 'EQm' }), /isn’t available/);
});

test('test mode: a price but never a deposit address', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'test', fetchImpl: f.fetchImpl });
  const d = await relay.createDeposit({ routeKey: 'usdc-base', gramNano: '5', recipient: 'EQm' });
  assert.equal(d.address, null);
  assert.equal(d.test, true);
  assert.equal(f.calls.find((c) => c.path.startsWith('/quote')).body.useDepositAddress, undefined);
});

test('off: nothing offered', async () => {
  const relay = createRelay({ mode: 'off', fetchImpl: fakeRelay().fetchImpl });
  assert.deepEqual(await relay.options(), []);
});

test('readStatus: success beats everything, then refunds, failures, a seen deposit, waiting', () => {
  assert.deepEqual(readStatus([]), { state: 'waiting' });
  assert.equal(readStatus([{ id: 'a', status: 'waiting' }]).state, 'waiting');
  assert.equal(readStatus([{ id: 'a', status: 'pending' }]).state, 'seen');
  assert.equal(readStatus([{ id: 'a', status: 'waiting', data: { inTxs: [{ hash: 'x' }] } }]).state, 'seen');
  assert.equal(readStatus([{ id: 'a', status: 'refund' }]).state, 'refunded');
  assert.equal(readStatus([{ id: 'a', status: 'failure' }]).state, 'failed');
  assert.deepEqual(readStatus([{ id: 'a', status: 'refund' }, { id: 'b', status: 'success', data: { outTxs: [{ hash: 'out' }] } }]), { state: 'success', requestId: 'b', outTx: 'out' });
});

test('live status reads the deposit address records', async () => {
  const f = fakeRelay({ requests: [{ id: 'r1', status: 'success', data: { outTxs: [{ hash: 'tonTx' }] } }] });
  const relay = createRelay({ mode: 'live', fetchImpl: f.fetchImpl });
  assert.deepEqual(await relay.status('0xDEPOSIT'), { state: 'success', requestId: 'r1', outTx: 'tonTx' });
  assert.match(f.calls.at(-1).query, /depositAddress=0xDEPOSIT/);
});

// ---- settling Relay orders -------------------------------------------------

function setup() {
  const { orders, payments } = openStore(':memory:');
  let clock = 1_000_000;
  const events = [];
  let purchases = 0;
  const engine = createEngine({
    orders, payments,
    supplier: { async purchase({ packages }) { purchases++; return packages.map((p) => ({ code: `CODE${purchases}`, value: p.value })); } },
    notify: (e) => events.push(e), now: () => clock, log: {},
  });
  orders.insert({
    id: 'r1', tgUserId: '42', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }], faceValue: 22, currency: 'USD', costUsd: 22,
    amountNano: String(10n * GRAM), comment: 'TS-REL', createdAt: clock, expiresAt: clock + 20 * 60e3, method: 'relay',
    relay: { coin: 'USDC', network: 'Base', address: '0xDEPOSIT', amountFormatted: '9.61' },
  });
  return { orders, engine, events, advance: (ms) => { clock += ms; }, purchases: () => purchases };
}

test('a Relay success pays and delivers once', async () => {
  const s = setup();
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'seen', requestId: 'q' }), 'seen');
  assert.ok(s.orders.get('r1').seen_at);
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'success', requestId: 'q', outTx: 'tonTx' }), 'paid');
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'success', requestId: 'q', outTx: 'tonTx' }), 'seen');
  const o = s.orders.get('r1');
  assert.equal(o.status, 'delivered');
  assert.equal(o.tx_hash, 'tonTx');
  assert.equal(o.relay.coin, 'USDC');
  assert.equal(s.purchases(), 1);
});

test('a late Relay success (after expiry, within the grace window) still delivers', async () => {
  const s = setup();
  s.advance(25 * 60e3);
  await s.engine.tick();
  assert.equal(s.orders.get('r1').status, 'expired');
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'success', requestId: 'q2' }), 'paid');
  assert.equal(s.orders.get('r1').status, 'delivered');
});

test('a Relay refund closes the order and tells the buyer; a failure goes to a person', async () => {
  const s = setup();
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'refunded', requestId: 'q', outTx: 'back' }), 'refunded');
  assert.equal(s.orders.get('r1').status, 'expired');
  assert.match(s.orders.get('r1').error, /sent your payment back/);
  assert.equal(s.events.at(-1).type, 'relay_refunded');
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'refunded', requestId: 'q' }), 'seen');
  assert.equal(await s.engine.applyRelay({ orderId: 'r1', state: 'failed', requestId: 'z' }), 'failed');
  assert.equal(s.events.at(-1).type, 'relay_failed');
  assert.equal(s.purchases(), 0);
});

test('Relay reports never pay a GRAM or Stars order', async () => {
  const s = setup();
  s.orders.insert({
    id: 'g1', tgUserId: '42', region: 'US', planId: 'pro_m', packages: [{ id: 'p', value: 22 }], faceValue: 22, currency: 'USD', costUsd: 22,
    amountNano: String(10n * GRAM), comment: 'TS-GRM', createdAt: 1, expiresAt: 1e12,
  });
  assert.equal(await s.engine.applyRelay({ orderId: 'g1', state: 'success', requestId: 'x' }), 'unmatched');
  assert.equal(s.orders.get('g1').status, 'awaiting_payment');
});

test('test mode still makes an order when Relay is unreachable (no amount, nothing to send)', async () => {
  const relay = createRelay({ mode: 'test', fetchImpl: async () => { throw new Error('offline'); }, log: {} });
  const d = await relay.createDeposit({ routeKey: 'usdc-base', gramNano: '5', recipient: 'EQm' });
  assert.equal(d.test, true);
  assert.equal(d.address, null);
  assert.equal(d.amount, null);
});

test('live mode never pretends: an unreachable Relay is an error', async () => {
  const relay = createRelay({ mode: 'live', fetchImpl: async () => { throw new Error('offline'); }, log: {} });
  await assert.rejects(relay.createDeposit({ routeKey: 'usdc-base', gramNano: '5', recipient: 'EQm' }));
});
