import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pickPackages, termsFor, REGIONS } from '../src/catalog.js';
import { mockSupplier } from '../src/supplier/mock.js';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';

test('terms: Pro gets Apple\'s yearly plan where we know its price; Max is 1/3/6 months', () => {
  assert.deepEqual(termsFor('pro_m', REGIONS.US), [1, 3, 6, 12]);
  assert.deepEqual(termsFor('max20_m', REGIONS.US), [1, 3, 6]);
  assert.deepEqual(termsFor('pro_m', REGIONS.GB), [1, 3, 6]);
});

test('code picker: few codes for small amounts, up to 6 for 6 months of Max 20x', async () => {
  const pk = await mockSupplier.listPackages('US');
  assert.ok(pickPackages(pk, 22).packages.length <= 2);
  const big = pickPackages(pk, 249.99 * 6 * 1.1); // ~$1650 incl. tax buffer, biggest card $500
  assert.ok(big.faceValue >= 1649.93);
  assert.ok(big.packages.length >= 4 && big.packages.length <= 6, `${big.packages.length} codes`);
  assert.equal(pickPackages(pk, 1e6), null, 'impossible amounts give no quote');
});

test('renewal reminder lands ~3 days before the credit runs out', () => {
  const { orders, payments } = openStore(':memory:');
  const t0 = Date.UTC(2026, 0, 1);
  let clock = t0;
  const sent = [];
  const engine = createEngine({ orders, payments, supplier: {}, log: {}, now: () => clock, notify: (e) => sent.push(e.order.id) });
  for (const [id, months] of [['m1', 1], ['m3', 3], ['y', 12]]) {
    orders.insert({ id, tgUserId: '1', region: 'US', planId: 'pro_m', packages: [], faceValue: 1, currency: 'USD', costUsd: 1, amountNano: '1', comment: 'TS-' + id, createdAt: t0, expiresAt: t0, months });
    orders.update(id, { status: 'delivered', delivered_at: t0 });
  }
  const at = (days) => { clock = t0 + days * 86400e3; engine.remindRenewals(); return [...sent]; };
  assert.deepEqual(at(26), []);
  assert.deepEqual(at(28), ['m1']);
  assert.deepEqual(at(86), ['m1']);
  assert.deepEqual(at(88), ['m1', 'm3']);
  assert.deepEqual(at(361), ['m1', 'm3']);
  assert.deepEqual(at(363), ['m1', 'm3', 'y']);
});

// API: the real server in demo mode
const PORT = 8911;
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
  env: { ...process.env, PORT: String(PORT), DB_PATH: ':memory:', PAYMENT_MODE: 'mock', BOT_TOKEN: '', SUPPLIER: 'mock', STORE_REGION: 'US', APPLE_PRICE_SYNC: 'off' },
  stdio: 'ignore',
});
after(() => srv.kill());
const call = async (path, body) => {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}${path}`, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
      return { status: r.status, body: await r.json() };
    } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};

test('API: catalog lists every term with its own price; orders keep their term', async () => {
  const { body } = await call('/api/catalog');
  const pro = body.plans.find((p) => p.id === 'pro_m');
  const max = body.plans.find((p) => p.id === 'max20_m');
  assert.deepEqual(pro.terms.map((t) => t.months), [1, 3, 6, 12]);
  assert.deepEqual(max.terms.map((t) => t.months), [1, 3, 6]);
  const [m1, m3, , y] = pro.terms;
  assert.equal(m3.appPrice, 60);
  assert.equal(y.appPrice, 214.99);
  assert.ok(y.annual && !m3.annual);
  assert.ok(m3.gram > m1.gram * 2.5 && m3.gram < m1.gram * 3.5);
  assert.ok(y.gram < m1.gram * 12, 'the yearly plan costs less than 12 months');
  assert.equal(pro.gram, m1.gram, 'top-level fields still describe one month');

  const o = await call('/api/orders', { planId: 'pro_m', months: 3, method: 'gram' });
  assert.equal(o.status, 200);
  assert.equal(o.body.months, 3);
  assert.equal(o.body.gram, m3.gram);
  const bad = await call('/api/orders', { planId: 'max20_m', months: 12, method: 'gram' });
  assert.equal(bad.status, 400, 'no yearly Max');
  const odd = await call('/api/orders', { planId: 'pro_m', months: 2, method: 'gram' });
  assert.equal(odd.status, 400);
});
