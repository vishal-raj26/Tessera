import test from 'node:test';
import assert from 'node:assert/strict';
import { createCryptoRefillsCatalog } from '../src/supplier/cryptorefills.js';
import { pickPackages } from '../src/pricing.js';

const brand = (name, country, outOfStock = false) => ({
  brand: name, family: name, brand_id: name, country_code: country, kind: 'giftcard', is_out_of_stock: outOfStock,
});
const card = (value, cost, currency = 'USD') => ({
  product_id: value + currency, coin: 'USDC', coin_amount: cost, payment_method: 'USDC-MORPH',
  face_value: { currency_code: currency, amount: { type: 'fixed', price: value } },
});
function fixture(catalog, detail) {
  const calls = [];
  const supplier = createCryptoRefillsCatalog({
    fetchImpl: async (url, options) => {
      calls.push([url, options.method]);
      return Response.json(url.pathname === '/v2/brands' ? catalog : detail);
    },
  });
  return { supplier, calls };
}

test('selects the in-stock Apple family and prices only matching fixed USD cards', async () => {
  const apple = brand('Everything Apple', 'US');
  const { supplier, calls } = fixture({
    country_code: 'US', all_brands: [brand('App Store & iTunes', 'US', true), brand('Google Play', 'US'), apple],
  }, [{ ...apple, products: [card('2', '2.17'), card('60', '64.97'), card('70', '75.79'), card('9', '0.01', 'CAD')] }]);
  const snapshot = await supplier.fetchSnapshot('US', 'appstore');
  assert.equal(calls[1][0].searchParams.get('family_name'), 'Everything Apple');
  assert.deepEqual(snapshot.packages.map((item) => item.value), [2, 60, 70]);
  assert.equal(pickPackages(snapshot.packages, 66).faceValue, 66);
  assert.equal(pickPackages(snapshot.packages, 66).costUsd, 71.48);
  assert.ok(calls.every(([, method]) => method === 'GET'));
});

test('India Apple is unavailable even when Google Play is in stock', async () => {
  const { supplier, calls } = fixture({
    country_code: 'IN', all_brands: [brand('App Store & iTunes', 'IN', true), brand('Google Play', 'IN')],
  });
  await assert.rejects(supplier.fetchSnapshot('IN', 'appstore'), { authoritative: true });
  assert.equal(calls.length, 1);
});

test('stock flags and country mismatches in product detail invalidate availability', async () => {
  const play = brand('Google Play', 'KR');
  for (const detail of [{ ...play, is_out_of_stock: true }, { ...play, country_code: 'US' }]) {
    const { supplier } = fixture({ country_code: 'KR', all_brands: [play] }, [{ ...detail, products: [card('5', '5')] }]);
    await assert.rejects(supplier.fetchSnapshot('KR', 'play'), { authoritative: true });
  }
});

test('the preview refuses purchases without calling the provider', async () => {
  const { supplier, calls } = fixture();
  await assert.rejects(supplier.purchase(), /preview/);
  assert.equal(calls.length, 0);
});
