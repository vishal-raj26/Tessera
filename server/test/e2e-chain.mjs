// End-to-end check of PAYMENT_MODE=chain against a fake TON Center (streaming SSE + v3 REST).
// Run: npm run test:e2e
import http from 'node:http';
import { spawn } from 'node:child_process';
import { Address } from '@ton/core';
import { commentPayload } from '../src/chain.js';
import assert from 'node:assert/strict';

const MERCHANT_RAW = '0:' + 'ab'.repeat(32);
const MERCHANT = Address.parse(MERCHANT_RAW).toString({ bounceable: false, testOnly: true });
const FAKE = 9911;
const API = 8899;

let sseClients = [];
const restTxs = [];
const fake = http.createServer((req, res) => {
  if (req.url.startsWith('/api/streaming/v2/sse') && req.method === 'POST') {
    res.writeHead(200, { 'content-type': 'text/event-stream' });
    res.write('data: {"status":"subscribed"}\n\n');
    sseClients.push(res);
    req.on('close', () => { sseClients = sseClients.filter((c) => c !== res); });
    return;
  }
  if (req.url.startsWith('/rates')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ rates: { TON: { prices: { USD: 1.2 } } } }));
  }
  if (req.url.startsWith('/api/v3/transactions')) {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ transactions: [...restTxs].reverse() }));
  }
  res.writeHead(404).end();
});
await new Promise((r) => fake.listen(FAKE, r));

const tx = (hash, memo, nano) => ({
  hash, account: MERCHANT_RAW, lt: String(Date.now()),
  in_msg: { source: '0:' + '22'.repeat(32), destination: MERCHANT_RAW, value: String(nano), bounced: false,
    message_content: { body: commentPayload(memo), decoded: { type: 'text_comment', comment: memo } } },
  description: { aborted: false },
});
const push = (finality, t) => {
  const data = JSON.stringify({ type: 'transactions', finality, trace_external_hash_norm: 'T', transactions: [t] });
  for (const c of sseClients) c.write(`: keepalive\n\ndata: ${data}\n\n`);
};
const freshWalletTx = (hash, memo, nano) => {
  const t = tx(hash, memo, nano);
  Object.assign(t, { orig_status: 'nonexist', end_status: 'uninit' });
  Object.assign(t.in_msg, { bounce: false });
  t.description = {
    type: 'ord', aborted: true, destroyed: false, credit_first: true,
    credit_ph: { credit: String(nano) }, compute_ph: { skipped: true, reason: 'no_state' },
  };
  return t;
};

const server = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
  env: {
    ...process.env, PORT: String(API), DB_PATH: ':memory:', PAYMENT_MODE: 'chain', TON_NETWORK: 'testnet',
    MERCHANT_WALLET: MERCHANT, TON_STREAM_URL: `http://localhost:${FAKE}/api/streaming/v2/sse`,
    TONCENTER_URL: `http://localhost:${FAKE}/api/v3`, RATE_URL: `http://localhost:${FAKE}/rates`, BOT_TOKEN: '', SUPPLIER: 'mock', APPLE_PRICE_SYNC: 'off',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let logs = '';
server.stdout.on('data', (d) => { logs += d; });
server.stderr.on('data', (d) => { logs += d; });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const call = async (path, init) => (await fetch(`http://localhost:${API}${path}`, { ...init, headers: { 'content-type': 'application/json' } })).json();
async function until(fn, ms, what) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}\n--- server log ---\n${logs}`);
    await sleep(250);
  }
}

try {
  await until(() => logs.includes('[stream] connected'), 10000, 'stream connection');
  const cfg = await call('/api/config');
  assert.equal(cfg.network, 'testnet');
  assert.ok(cfg.merchant.startsWith('0Q'), 'merchant is a testnet friendly address');

  // 1) streaming path: pending → "seen", finalized → delivered
  const a = await call('/api/orders', { method: 'POST', body: JSON.stringify({ planId: 'pro_m' }) });
  push('pending', tx('hA', a.comment, a.amountNano));
  const seen = await until(async () => { const o = await call(`/api/orders/${a.id}`); return o.paymentSeen && o; }, 5000, 'payment seen');
  assert.equal(seen.status, 'awaiting_payment');
  push('finalized', tx('hA', a.comment, a.amountNano));
  const done = await until(async () => { const o = await call(`/api/orders/${a.id}`); return o.status === 'delivered' && o; }, 8000, 'delivery via stream');
  assert.equal(done.codes.length >= 1, true);
  console.log('✓ stream: pending shown as seen, finalized delivered', done.codes.map((c) => c.code).join(', '));

  // 2) backstop: a payment the stream never delivered is found by the v3 poller
  const b = await call('/api/orders', { method: 'POST', body: JSON.stringify({ planId: 'max5_m' }) });
  restTxs.push(freshWalletTx('hB', b.comment, b.amountNano));
  await until(async () => (await call(`/api/orders/${b.id}`)).status === 'delivered', 25000, 'delivery via poller');
  console.log('✓ poller: missed-by-stream payment still delivered');

  // 3) the poller seeing the stream's tx again doesn't buy twice
  restTxs.push(tx('hA', a.comment, a.amountNano));
  await sleep(16000);
  const again = await call(`/api/orders/${a.id}`);
  assert.equal(again.status, 'delivered');
  assert.ok(!logs.includes(`[order ${a.id}] delivered 1 code(s)\n[order ${a.id}]`), 'no second delivery');
  const deliveries = (logs.match(new RegExp(`\\[order ${a.id}\\] delivered`, 'g')) || []).length;
  assert.equal(deliveries, 1);
  console.log('✓ duplicate sightings are ignored');

  const c = await call('/api/orders', { method: 'POST', body: JSON.stringify({ planId: 'pro_m' }) });
  const firstCredit = freshWalletTx('hC', c.comment, c.amountNano);
  push('pending', firstCredit);
  await until(async () => (await call(`/api/orders/${c.id}`)).paymentSeen, 5000, 'fresh-wallet pending credit');
  assert.equal((await call(`/api/orders/${c.id}`)).status, 'awaiting_payment');
  push('finalized', firstCredit);
  await until(async () => (await call(`/api/orders/${c.id}`)).status === 'delivered', 8000, 'fresh-wallet finalized credit');
  console.log('✓ fresh-wallet credits require finality before delivery');
  console.log('E2E OK');
} finally {
  server.kill();
  fake.close();
  for (const c of sseClients) c.end();
}
