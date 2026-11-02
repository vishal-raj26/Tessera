// The pricing rules on their own: credit and tax, strict supplier matching, freshness, and the card picker
// against brute force. Supplier data comes from the recorded storefront fixture (mock) or, for the
// Bitrefill adapter, from small synthetic responses built only from documented fields (marked SYNTHETIC).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { requiredCredit, usableCards, pickPackages, SupplierUnavailable } from '../src/pricing.js';
import { createMockSupplier, mockSupplier } from '../src/supplier/mock.js';
import { cachedSupplier } from '../src/supplier/cache.js';
import { createBitrefillSupplier, pickProduct, toSnapshot } from '../src/supplier/bitrefill.js';

const T0 = Date.UTC(2026, 10, 2, 12);
const snapUS = (over = {}) => ({
  region: 'US', store: 'appstore', currency: 'USD', productId: 'p-us', fetchedAt: T0, source: 'test', live: false,
  packages: [{ id: 'a', productId: 'p-us', value: 10, costUsd: 10.5 }, { id: 'b', productId: 'p-us', value: 25, costUsd: 26.25 }],
  ...over,
});
const unavailable = (fn, code) => assert.throws(fn, (e) => e instanceof SupplierUnavailable && e.code === code, `expected ${code}`);

// ---- credit and tax ----

test('credit: price plus tax, rounded up to the cent, never short', () => {
  assert.equal(requiredCredit(20, 0.12), 22.4);
  assert.equal(requiredCredit(19.99, 0.12), 22.39); // 22.3888 -> up
  assert.equal(requiredCredit(124.99, 0.15), 143.74); // 143.7385 -> up
  assert.equal(requiredCredit(20, 0), 20);
  assert.equal(requiredCredit(0, 0.1), null);
  assert.throws(() => requiredCredit(20, -0.1));
  assert.throws(() => requiredCredit(20, 1.5));
});

// ---- strict matching ----

test('matching: only the exact store, country and currency are used', () => {
  const want = { region: 'US', store: 'appstore', currency: 'USD', now: T0, maxAgeMs: 60e3 };
  assert.equal(usableCards(snapUS(), want).length, 2);
  unavailable(() => usableCards(snapUS({ store: 'play' }), want), 'mismatch');
  unavailable(() => usableCards(snapUS({ region: 'CA' }), want), 'mismatch');
  unavailable(() => usableCards(snapUS({ currency: 'CAD' }), want), 'mismatch');
  unavailable(() => usableCards(null, want), 'none');
  // EUR cards are never used for a US price, and the other way round
  unavailable(() => usableCards(snapUS({ region: 'DE', currency: 'EUR' }), want), 'mismatch');
});

test('matching: cards from another product, unavailable or without a cost are dropped', () => {
  const s = snapUS({ packages: [
    { id: 'ok', productId: 'p-us', value: 10, costUsd: 10.5 },
    { id: 'other-product', productId: 'p-ca', value: 25, costUsd: 1 },
    { id: 'sold-out', productId: 'p-us', value: 50, costUsd: 52.5, available: false },
    { id: 'no-cost', productId: 'p-us', value: 100, costUsd: NaN },
    { id: 'zero', productId: 'p-us', value: 0, costUsd: 1 },
  ] });
  assert.deepEqual(usableCards(s, { region: 'US', store: 'appstore', currency: 'USD' }).map((c) => c.id), ['ok']);
  unavailable(() => usableCards(snapUS({ packages: [] }), { region: 'US', store: 'appstore', currency: 'USD' }), 'empty');
});

test('freshness: data older than the limit is refused, never priced', () => {
  const want = { region: 'US', store: 'appstore', currency: 'USD', maxAgeMs: 30 * 60e3 };
  assert.ok(usableCards(snapUS(), { ...want, now: T0 + 29 * 60e3 }));
  unavailable(() => usableCards(snapUS(), { ...want, now: T0 + 31 * 60e3 }), 'stale');
  unavailable(() => usableCards(snapUS({ fetchedAt: undefined }), { ...want, now: T0 }), 'stale');
});

// ---- the picker: least supplier cost, then fewer codes, then less leftover ----

test('picker: minimises supplier cost even with more codes and more leftover credit', () => {
  // need 30: one 50 card costs 40; three 10s cost 33 (cheaper, more codes); 25 + 10 costs 36
  const cards = [{ id: 'ten', value: 10, costUsd: 11 }, { id: 'tf', value: 25, costUsd: 25 }, { id: 'fifty', value: 50, costUsd: 40 }];
  const a = pickPackages(cards, 30);
  assert.deepEqual(a.packages.map((p) => p.id), ['ten', 'ten', 'ten']);
  assert.equal(a.costUsd, 33);
  // need 41: 50 for $40 beats 25+10+10 ($47), despite 9 of leftover credit
  assert.deepEqual(pickPackages(cards, 41).packages.map((p) => p.id), ['fifty']);
});

test('picker: equal cost -> fewer codes, then less leftover', () => {
  const fewer = [{ id: 's', value: 10, costUsd: 10 }, { id: 'l', value: 20, costUsd: 20 }];
  assert.deepEqual(pickPackages(fewer, 20).packages.map((p) => p.id), ['l']);
  // two single cards cost the same; 25 leaves less over than 30
  const leftover = [{ id: 'x25', value: 25, costUsd: 30 }, { id: 'x30', value: 30, costUsd: 30 }];
  assert.deepEqual(pickPackages(leftover, 24).packages.map((p) => p.id), ['x25']);
});

test('picker: only denominations that exist are used (recorded US App Store cards start at $10)', async () => {
  const { packages } = await mockSupplier.fetchSnapshot('US', 'appstore');
  const values = new Set(packages.map((p) => p.value));
  assert.ok(!values.has(2) && !values.has(60), 'no $2 or $60 card in the recording');
  for (const need of [5, 22.4, 66, 67.17, 143.74, 1679.94]) {
    const pick = pickPackages(packages, need);
    assert.ok(pick.packages.every((p) => values.has(p.value)), `${need}`);
    assert.ok(pick.faceValue >= need);
  }
  // removing a card that would be chosen makes the picker use the next cheapest mix, not invent one
  const no25 = packages.filter((p) => p.value !== 25);
  const pick = pickPackages(no25, 22.4);
  assert.ok(pick.packages.every((p) => p.value !== 25));
  assert.ok(pick.faceValue >= 22.4);
});

/** Every multiset of up to maxCodes cards that covers `need`: the reference answer. */
function bruteForce(cards, need, maxCodes) {
  let best = null;
  const cur = [];
  (function walk(from, face, cost) {
    if (face >= need - 1e-9) {
      const cand = { cost: Math.round(cost * 100) / 100, codes: cur.length, face };
      if (!best || cand.cost < best.cost - 1e-9 || (Math.abs(cand.cost - best.cost) <= 1e-9 && (cand.codes < best.codes || (cand.codes === best.codes && cand.face < best.face)))) best = cand;
      return;
    }
    if (cur.length === maxCodes) return;
    for (let i = from; i < cards.length; i++) { cur.push(cards[i]); walk(i, face + cards[i].value, cost + cards[i].costUsd); cur.pop(); }
  })(0, 0, 0);
  return best;
}

test('picker: matches brute force on the recorded cards and on random card sets (cost, codes, leftover)', async () => {
  const recorded = createMockSupplier();
  const sets = [
    (await recorded.fetchSnapshot('US', 'appstore')).packages,
    (await recorded.fetchSnapshot('US', 'play')).packages,
    (await recorded.fetchSnapshot('DE', 'appstore')).packages,
  ];
  let seed = 11;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let t = 0; t < 120; t++) {
    const vals = [...new Set(Array.from({ length: 2 + Math.floor(rnd() * 4) }, () => [5, 10, 15, 20, 25, 30, 50, 75, 100][Math.floor(rnd() * 9)]))];
    sets.push(vals.map((v, i) => ({ id: `r${i}`, value: v, costUsd: Math.round(v * (0.9 + rnd() * 0.2) * 100) / 100 })));
  }
  let checked = 0;
  for (const [si, cards] of sets.entries()) {
    for (let k = 0; k < (si < 3 ? 25 : 3); k++) {
      const need = Math.round((3 + rnd() * (si < 3 ? 900 : 160)) * 100) / 100;
      const maxCodes = si < 3 ? 6 : 1 + Math.floor(rnd() * 5);
      const want = bruteForce(cards, need, maxCodes);
      const got = pickPackages(cards, need, maxCodes);
      if (!want) { assert.equal(got, null, `set ${si} need ${need}`); continue; }
      assert.equal(got.costUsd, want.cost, `set ${si} need ${need}: cost`);
      assert.equal(got.packages.length, want.codes, `set ${si} need ${need}: codes`);
      assert.equal(got.faceValue, Math.round(want.face * 100) / 100, `set ${si} need ${need}: leftover`);
      checked++;
    }
  }
  assert.ok(checked > 200, `${checked} cases`);
});

// ---- mock supplier: recorded data only ----

test('mock supplier: recorded stores only, labelled as a fixture, never live', async () => {
  const us = await mockSupplier.fetchSnapshot('US', 'appstore');
  assert.equal(us.live, false);
  assert.match(us.source, /^fixture:bitrefill-storefront-/);
  assert.equal(us.currency, 'USD');
  const de = await mockSupplier.fetchSnapshot('DE', 'appstore');
  assert.equal(de.currency, 'EUR');
  assert.ok(de.packages.every((p) => p.productId === de.productId));
  await assert.rejects(() => mockSupplier.fetchSnapshot('GB', 'appstore'), /no recorded cards/);
  await assert.rejects(() => mockSupplier.fetchSnapshot('DE', 'play'), /no recorded cards/);
});

// ---- cache: stale and unavailable supplier data ----

test('cache: a failing supplier keeps the last data only until it is too old', async () => {
  let clock = T0;
  let fail = false;
  let calls = 0;
  const inner = { name: 'x', live: true, async fetchSnapshot(region, store) { calls++; if (fail) throw new Error('down'); return snapUS({ region, store, fetchedAt: clock }); } };
  const c = cachedSupplier(inner, { ttlMs: 5 * 60e3, maxAgeMs: 30 * 60e3, retryMs: 60e3, now: () => clock, log: {} });
  const want = (now) => ({ region: 'US', store: 'appstore', currency: 'USD', now, maxAgeMs: c.maxAgeMs });
  assert.equal(usableCards(await c.snapshot('US'), want(clock)).length, 2);
  fail = true;
  clock += 10 * 60e3; // past ttl: background refresh fails, old data still fresh enough
  assert.ok(usableCards(await c.snapshot('US'), want(clock)));
  await new Promise((r) => setImmediate(r));
  assert.match(c.status()[0].error, /down/);
  const before = calls;
  await c.snapshot('US'); // within retryMs: no new request
  assert.equal(calls, before);
  clock += 25 * 60e3; // 35 min old: refused
  const old = await c.snapshot('US');
  unavailable(() => usableCards(old, want(clock)), 'stale');
  assert.equal(c.status()[0].fresh, false);
  fail = false;
  clock += 2 * 60e3;
  assert.ok(usableCards(await c.snapshot('US'), want(clock)), 'recovers once the supplier answers');
});

test('cache: concurrent quotes share one fetch', async () => {
  let calls = 0;
  const inner = { name: 'x', live: true, async fetchSnapshot(region, store) { calls++; await new Promise((r) => setTimeout(r, 20)); return snapUS({ region, store, fetchedAt: Date.now() }); } };
  const c = cachedSupplier(inner, { log: {} });
  const all = await Promise.all(Array.from({ length: 8 }, () => c.snapshot('US')));
  assert.equal(calls, 1);
  assert.ok(all.every((s) => s && s.packages.length === 2));
});

// ---- Bitrefill adapter (SYNTHETIC responses built from documented fields only) ----

const P = (over) => ({ id: 'x', name: 'X', type: 'gift_card', country: 'US', currency: 'USD', in_stock: true, ...over });

test('bitrefill: picks exactly one product for the store, country and currency', () => {
  const list = [
    P({ id: 'apple-usa', name: 'Apple Gift Card' }),
    P({ id: 'itunes-germany', name: 'Apple Gift Card', country: 'DE', currency: 'EUR' }),
    P({ id: 'google-play-usa', name: 'Google Play' }),
    P({ id: 'amazon-us', name: 'Amazon.com' }),
  ];
  assert.equal(pickProduct(list, { region: 'US', store: 'appstore', currency: 'USD' }).id, 'apple-usa');
  assert.equal(pickProduct(list, { region: 'US', store: 'play', currency: 'USD' }).id, 'google-play-usa');
  assert.equal(pickProduct(list, { region: 'DE', store: 'appstore', currency: 'EUR' }).id, 'itunes-germany');
  assert.throws(() => pickProduct(list, { region: 'DE', store: 'play', currency: 'EUR' }), /no play gift card/);
  assert.throws(() => pickProduct(list, { region: 'GB', store: 'appstore', currency: 'GBP' }), /no appstore/);
  assert.throws(() => pickProduct([...list, P({ id: 'itunes-usa', name: 'iTunes' })], { region: 'US', store: 'appstore', currency: 'USD' }), /several/);
  // a US-country product priced in another currency is not a match
  assert.throws(() => pickProduct([P({ id: 'apple-usa', currency: 'EUR' })], { region: 'US', store: 'appstore', currency: 'USD' }), /no appstore/);
});

test('bitrefill: no verified cost field means no price, before any request is made', async () => {
  let requests = 0;
  const s = createBitrefillSupplier({ env: { BITREFILL_API_ID: 'id', BITREFILL_API_SECRET: 's' }, fetchImpl: async () => { requests++; return new Response('{}'); } });
  await assert.rejects(() => s.fetchSnapshot('US', 'appstore'), /cost field not verified/);
  const s2 = createBitrefillSupplier({ env: { BITREFILL_API_ID: 'id', BITREFILL_API_SECRET: 's', BITREFILL_COST_FIELD: 'price', BITREFILL_COST_CURRENCY: 'EUR' }, fetchImpl: async () => { requests++; return new Response('{}'); } });
  await assert.rejects(() => s2.fetchSnapshot('US', 'appstore'), /cost field not verified/);
  assert.equal(requests, 0);
});

test('bitrefill: a product detail becomes a strict snapshot', () => {
  const opts = { region: 'US', store: 'appstore', currency: 'USD', costField: 'cost.usd', costCurrency: 'USD', now: T0 };
  const detail = { data: P({ id: 'apple-usa', packages: [
    { package_id: 'apple-usa<&>10', value: 10, cost: { usd: 10.3 } },
    { package_id: 'apple-usa<&>25', value: '25', cost: { usd: 25.6 } },
    { package_id: 'apple-usa<&>50', value: 50 }, // no cost: dropped
    { package_id: 'apple-usa<&>100', value: 100, cost: { usd: 101 }, in_stock: false },
  ] }) };
  const s = toSnapshot(detail, opts);
  assert.deepEqual(s.packages.map((p) => [p.id, p.value, p.costUsd]), [['apple-usa<&>10', 10, 10.3], ['apple-usa<&>25', 25, 25.6]]);
  assert.deepEqual(s.dropped, ['apple-usa<&>50', 'apple-usa<&>100']);
  assert.equal(s.live, true);
  assert.throws(() => toSnapshot({ data: P({ country: 'CA' }) }, opts), /not US USD/);
  assert.throws(() => toSnapshot({ data: P({ currency: 'CAD' }) }, opts), /not US USD/);
  assert.throws(() => toSnapshot({ data: P({ in_stock: false }) }, opts), /out of stock/);
});

test('bitrefill: follows paging, then reads the one matching product', async () => {
  const pages = {
    '/products?country=US&type=gift_card&limit=50': { data: [P({ id: 'amazon-us', name: 'Amazon' })], meta: { _next: 'https://api.bitrefill.com/v2/products?page=2' } },
    'https://api.bitrefill.com/v2/products?page=2': { data: [P({ id: 'apple-usa', name: 'Apple Gift Card' })], meta: {} },
    '/products/apple-usa': { data: P({ id: 'apple-usa', packages: [{ package_id: 'apple-usa<&>25', value: 25, price: 26 }] }) },
  };
  const seen = [];
  const fetchImpl = async (url, init) => {
    const key = url.replace('https://api.bitrefill.com/v2/products/', '/products/').replace(/^https:\/\/api\.bitrefill\.com\/v2(\/products\?country)/, '$1');
    seen.push([key, init.headers.Authorization]);
    return new Response(JSON.stringify(pages[key] ?? pages[url]), { status: pages[key] || pages[url] ? 200 : 404 });
  };
  const s = createBitrefillSupplier({ env: { BITREFILL_API_ID: 'id', BITREFILL_API_SECRET: 'sec', BITREFILL_COST_FIELD: 'price', BITREFILL_COST_CURRENCY: 'USD' }, fetchImpl, now: () => T0 });
  const snap = await s.fetchSnapshot('US', 'appstore');
  assert.equal(snap.productId, 'apple-usa');
  assert.deepEqual(snap.packages, [{ id: 'apple-usa<&>25', productId: 'apple-usa', value: 25, costUsd: 26 }]);
  assert.equal(seen.length, 3);
  assert.ok(seen.every(([, auth]) => auth === 'Basic ' + Buffer.from('id:sec').toString('base64')));
  // an explicit product id skips the search, but the product is still checked
  const s2 = createBitrefillSupplier({ env: { BITREFILL_API_ID: 'id', BITREFILL_API_SECRET: 'sec', BITREFILL_COST_FIELD: 'price', BITREFILL_COST_CURRENCY: 'USD', BITREFILL_PRODUCT_IDS: '{"appstore:US":"apple-usa"}' }, fetchImpl, now: () => T0 });
  seen.length = 0;
  assert.equal((await s2.fetchSnapshot('US', 'appstore')).productId, 'apple-usa');
  assert.equal(seen.length, 1);
});
