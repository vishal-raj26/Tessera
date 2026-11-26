import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRelay, readStatus, TON_CHAIN } from '../src/relay.js';

// a fake Relay API: its chain list, quotes (recorded) and deposit-address request records
function fakeRelay({ requests = [] } = {}) {
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
      const b = JSON.parse(init.body);
      return json(200, {
        requestId: '0xreq',
        steps: [{ id: 'deposit', depositAddress: b.useDepositAddress ? { address: '0xTOPUP', type: 'open' } : undefined }],
        details: { currencyIn: { amount: '5800000', amountFormatted: '5.8', amountUsd: '5.79' } },
      });
    }
    if (u.pathname === '/requests/v3') return json(200, { requests });
    return json(404, {});
  };
  return { fetchImpl, calls };
}
const quotes = (f) => f.calls.filter((c) => c.path.startsWith('/quote'));

test('a top-up address is open, delivers GRAM to the buyer’s own wallet, and refunds the sender', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'live', fetchImpl: f.fetchImpl });
  const t = await relay.topUpAddress({ routeKey: 'usdc-base', recipient: 'UQbuyer' });
  assert.equal(t.address, '0xTOPUP');
  assert.equal(t.coin, 'USDC');
  assert.equal(t.test, false);
  const q = quotes(f)[0];
  assert.equal(q.path, '/quote/v2'); // no API key
  assert.equal(q.body.recipient, 'UQbuyer'); // never our wallet: we only ever receive GRAM, paid by the buyer
  assert.equal(q.body.destinationChainId, TON_CHAIN);
  assert.equal(q.body.destinationCurrency, 'EQ-native-gram');
  assert.equal(q.body.tradeType, 'EXACT_INPUT');
  assert.equal(q.body.useDepositAddress, true);
  assert.equal(q.body.strict, false); // reusable, any amount
  assert.equal(q.body.refundTo, '0x0000000000000000000000000000000000000000');
  assert.equal(q.body.amount, '20000000'); // 20 USDC nominal
});

test('an estimate is a price only: exact GRAM out, no address', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'live', fetchImpl: f.fetchImpl });
  const e = await relay.estimate({ routeKey: 'usdc-base', gramNano: '6000000000', recipient: 'UQbuyer' });
  assert.deepEqual(e, { amount: '5.8', usd: 5.79 });
  const q = quotes(f)[0];
  assert.equal(q.body.tradeType, 'EXACT_OUTPUT');
  assert.equal(q.body.amount, '6000000000');
  assert.equal(q.body.useDepositAddress, undefined);
});

test('with an API key: /quote/v3, the key header, and Solana routes', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'live', apiKey: 'k', fetchImpl: f.fetchImpl });
  assert.ok((await relay.options()).some((o) => o.key === 'usdc-solana'));
  await relay.topUpAddress({ routeKey: 'usdc-solana', recipient: 'UQb' });
  const q = quotes(f)[0];
  assert.equal(q.path, '/quote/v3');
  assert.equal(q.headers['x-api-key'], 'k');
  assert.equal(q.body.refundTo, '11111111111111111111111111111111');
});

test('without a key, live mode offers only routes that work without one', async () => {
  const relay = createRelay({ mode: 'live', fetchImpl: fakeRelay().fetchImpl });
  const keys = (await relay.options()).map((o) => o.key);
  assert.ok(keys.includes('usdc-base'));
  assert.ok(!keys.includes('usdc-solana'));
  await assert.rejects(relay.topUpAddress({ routeKey: 'usdc-solana', recipient: 'UQb' }), /isn’t available/);
});

test('test mode never creates an address', async () => {
  const f = fakeRelay();
  const relay = createRelay({ mode: 'test', fetchImpl: f.fetchImpl });
  const t = await relay.topUpAddress({ routeKey: 'usdc-base', recipient: 'UQb' });
  assert.equal(t.address, null);
  assert.equal(t.test, true);
  assert.equal(quotes(f).length, 0);
});

test('off: nothing offered', async () => {
  assert.deepEqual(await createRelay({ mode: 'off', fetchImpl: fakeRelay().fetchImpl }).options(), []);
});

test('readStatus follows only the latest deposit since the sheet opened', () => {
  const at = (iso) => Date.parse(iso);
  const old = { id: 'o', status: 'success', createdAt: '2026-11-26T10:00:00Z' };
  assert.deepEqual(readStatus([old], at('2026-11-26T11:00:00Z')), { state: 'waiting' });
  assert.equal(readStatus([old, { id: 'n', status: 'pending', createdAt: '2026-11-26T11:05:00Z' }], at('2026-11-26T11:00:00Z')).state, 'seen');
  assert.deepEqual(readStatus([{ id: 'n', status: 'success', createdAt: '2026-11-26T11:05:00Z', data: { outTxs: [{ hash: 'ton' }] } }], 0), { state: 'success', requestId: 'n', outTx: 'ton' });
  assert.equal(readStatus([{ id: 'n', status: 'refund', createdAt: '2026-11-26T11:05:00Z' }]).state, 'refunded');
  assert.equal(readStatus([{ id: 'n', status: 'failure', createdAt: '2026-11-26T11:05:00Z' }]).state, 'failed');
});

test('live status asks Relay by address', async () => {
  const f = fakeRelay({ requests: [{ id: 'r1', status: 'success', createdAt: '2026-11-26T11:05:00Z', data: { outTxs: [{ hash: 'tonTx' }] } }] });
  const relay = createRelay({ mode: 'live', fetchImpl: f.fetchImpl });
  assert.equal((await relay.status('0xTOPUP', 0)).state, 'success');
  assert.match(f.calls.at(-1).query, /depositAddress=0xTOPUP/);
});
