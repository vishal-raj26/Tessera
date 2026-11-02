import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { pickPackages, termsFor, REGIONS } from '../src/catalog.js';
import { mockSupplier } from '../src/supplier/mock.js';
import { openStore } from '../src/db.js';
import { createEngine } from '../src/engine.js';
import { isolatedEnv } from './isolated-env.js';

test('terms: Pro gets Apple\'s yearly plan where we know its price; Max is 1/3/6 months', () => {
  assert.deepEqual(termsFor('pro_m', REGIONS.US), [1, 3, 6, 12]);
  assert.deepEqual(termsFor('max20_m', REGIONS.US), [1, 3, 6]);
  assert.deepEqual(termsFor('pro_m', REGIONS.GB), [1, 3, 6]);
});

test('code picker: real US App Store cards (recorded) for small and large amounts', async () => {
  const snap = await mockSupplier.fetchSnapshot('US', 'appstore');
  const pk = snap.packages;
  const small = pickPackages(pk, 22.4); // Pro, 1 month, with 12% tax
  assert.ok(small.faceValue >= 22.4 && small.packages.length <= 2);
  const big = pickPackages(pk, 249.99 * 6 * 1.12);
  assert.ok(big.faceValue >= 249.99 * 6 * 1.12);
  assert.ok(big.packages.length <= 10, `${big.packages.length} codes`);
  assert.equal(pickPackages(pk, 1e6, 10), null, 'impossible within the code limit gives no quote');
});

test('code picker: the buyer always pays for the cheapest mix of cards', () => {
  // two $25 cards on discount cost less than one $50 card: take the two
  const pk = [{ id: 'a', value: 25, costUsd: 22 }, { id: 'b', value: 50, costUsd: 49 }, { id: 'c', value: 100, costUsd: 99 }];
  const p = pickPackages(pk, 50);
  assert.deepEqual(p.packages.map((x) => x.id), ['a', 'a']);
  assert.equal(p.costUsd, 44);
  // $60 needed: 25+25+25 ($66) beats 50+25 ($71) and 100 ($99)
  assert.equal(pickPackages(pk, 60).costUsd, 66);
  // same price either way: fewer codes win
  const flat = [{ id: 's', value: 10, costUsd: 10 }, { id: 'l', value: 20, costUsd: 20 }];
  assert.deepEqual(pickPackages(flat, 20).packages.map((x) => x.id), ['l']);
  // regional denominations (whole rupees, big numbers) work the same way
  const inr = [{ id: 'r500', value: 500, costUsd: 6 }, { id: 'r1000', value: 1000, costUsd: 12.1 }, { id: 'r2000', value: 2000, costUsd: 23.5 }];
  const r = pickPackages(inr, 1999);
  assert.equal(r.faceValue, 2000);
  assert.equal(r.costUsd, 23.5);
  // odd prices with paise
  assert.ok(pickPackages(inr, 1999.5).faceValue >= 1999.5);
});

test('code picker: a cheap many-card mix never hides a cheaper mix that fits the code limit', () => {
  // (Codex repro) ten 1000-cards ($110) beat one 10000-card ($200); the 500s alone would need 20 codes
  const pk = [{ id: 's', value: 500, costUsd: 5 }, { id: 'm', value: 1000, costUsd: 11 }, { id: 'l', value: 10000, costUsd: 200 }];
  const a = pickPackages(pk, 10000);
  assert.equal(a.costUsd, 110);
  assert.ok(a.packages.length <= 10);
  assert.equal(a.faceValue, 10000);
  // without the big card the $110 mix is still found
  assert.equal(pickPackages(pk.slice(0, 2), 10000).costUsd, 110);
  // a mix needing more codes than allowed is refused, not stretched
  assert.equal(pickPackages(pk.slice(0, 1), 10000, 10), null);
  // brute force agrees on random cases
  let seed = 7;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 200; t++) {
    const denoms = [...new Set(Array.from({ length: 2 + Math.floor(rnd() * 3) }, () => [5, 10, 15, 20, 25, 50, 100][Math.floor(rnd() * 7)]))];
    const list = denoms.map((v, i) => ({ id: String(i), value: v, costUsd: Math.round(v * (0.8 + rnd() * 0.4) * 100) / 100 }));
    const need = 5 + Math.floor(rnd() * 120);
    const max = 1 + Math.floor(rnd() * 5);
    let best = null;
    (function walk(from, face, cost, n) {
      if (face >= need) { if (!best || cost < best - 1e-9) best = cost; return; }
      if (n === max) return;
      for (let i = from; i < list.length; i++) walk(i, face + list[i].value, cost + list[i].costUsd, n + 1);
    })(0, 0, 0, 0);
    const got = pickPackages(list, need, max);
    if (best === null) assert.equal(got, null, `case ${t}`);
    else { assert.ok(Math.abs(got.costUsd - Math.round(best * 100) / 100) < 0.011, `case ${t}: ${got.costUsd} vs ${best}`); assert.ok(got.packages.length <= max); assert.ok(got.faceValue >= need); }
  }
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
  env: isolatedEnv({ PORT: String(PORT) }),
  stdio: 'ignore',
});
after(async () => { srv.kill(); await new Promise((r) => (srv.exitCode !== null ? r() : srv.once('exit', r))); });
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

test('API: a code can be ticked as redeemed and unticked; only real codes of a delivered order', async () => {
  const { body: o } = await call('/api/orders', { planId: 'max20_m', months: 6, method: 'gram' });
  assert.ok(o.id, JSON.stringify(o));
  assert.equal((await call(`/api/orders/${o.id}/codes/0`, { redeemed: true })).status, 400, 'not delivered yet');
  await call(`/api/orders/${o.id}/mock-pay`, {});
  let d;
  for (let i = 0; i < 40; i++) {
    d = (await call(`/api/orders/${o.id}`)).body;
    if (d.status === 'delivered') break;
    await new Promise((r) => setTimeout(r, 200));
  }
  assert.equal(d.status, 'delivered');
  assert.ok(d.codes.length > 1, 'six months of Max 20x takes several codes');
  const marked = (await call(`/api/orders/${o.id}/codes/1`, { redeemed: true })).body;
  assert.ok(marked.codes[1].redeemedAt > 0);
  assert.ok(!marked.codes[0].redeemedAt);
  assert.equal(marked.codes[1].code, d.codes[1].code, 'the code itself is unchanged');
  const unmarked = (await call(`/api/orders/${o.id}/codes/1`, { redeemed: false })).body;
  assert.equal(unmarked.codes[1].redeemedAt, null);
  assert.equal((await call(`/api/orders/${o.id}/codes/99`, { redeemed: true })).status, 400);
  assert.equal((await call('/api/orders/nope/codes/0', { redeemed: true })).status, 404);
});
