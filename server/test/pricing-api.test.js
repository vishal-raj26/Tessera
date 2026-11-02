// The whole pricing flow through the API, on the mock supplier (recorded Bitrefill storefront cards):
// plan + term + store + region -> in-app price -> credit with tax -> that store/country/currency's cards
// -> cheapest mix. Also: the mock supplier can never take real money.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isolatedEnv } from './isolated-env.js';
import { openStore } from '../src/db.js';
import { requiredCredit, pickPackages } from '../src/pricing.js';
import { mockSupplier } from '../src/supplier/mock.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-pricing-'));
const dbFile = path.join(dir, 't.db');
const seedStore = openStore(dbFile);
seedStore.settings.set('price:US:play:pro_m', 19.99); // Play price for Pro (Play has no defaults)
seedStore.settings.set('tax:CA', 0.15);
seedStore.db.close();

const PORT = 8961;
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], { env: isolatedEnv({ PORT: String(PORT), DB_PATH: dbFile }), stdio: 'ignore' });
after(async () => {
  srv.kill();
  await new Promise((r) => (srv.exitCode !== null ? r() : srv.once('exit', r)));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});
const get = async (p) => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}${p}`); return { status: r.status, body: await r.json() }; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};
const post = async (p, body) => { const r = await fetch(`http://localhost:${PORT}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const term = (cat, planId, months) => cat.plans.find((p) => p.id === planId)?.terms.find((t) => t.months === months);

test('API: US App Store: credit is price x term plus 12% tax, bought with real US cards at least cost', async () => {
  const { body } = await get('/api/catalog?region=US&store=appstore');
  const us = (await mockSupplier.fetchSnapshot('US', 'appstore')).packages;
  for (const [planId, months, appPrice] of [['pro_m', 1, 20], ['pro_m', 3, 60], ['pro_m', 6, 120], ['max5_m', 1, 124.99], ['max20_m', 6, 1499.94]]) {
    const t = term(body, planId, months);
    assert.equal(t.appPrice, appPrice, `${planId} ${months}m price`);
    assert.equal(t.needed, requiredCredit(appPrice, 0.12), `${planId} ${months}m credit`);
    const best = pickPackages(us, t.needed);
    assert.equal(t.credit, best.faceValue, `${planId} ${months}m cards`);
    assert.equal(t.codes, best.packages.length);
    assert.ok(t.credit >= t.needed);
    assert.equal(t.currency, 'USD');
  }
});

test('API: 12 months uses the store\'s yearly price, not 12 monthly payments', async () => {
  const { body } = await get('/api/catalog?region=US&store=appstore');
  const y = term(body, 'pro_m', 12);
  assert.equal(y.appPrice, 214.99);
  assert.equal(y.needed, requiredCredit(214.99, 0.12));
  assert.ok(y.needed < requiredCredit(20 * 12, 0.12), 'cheaper than 12 monthly payments');
  assert.equal(term(body, 'max5_m', 12), undefined, 'no yearly plan, no 1-year term');
});

test('API: Google Play is priced with Google Play cards only', async () => {
  const { body } = await get('/api/catalog?region=US&store=play');
  const t = term(body, 'pro_m', 1);
  assert.equal(t.appPrice, 19.99);
  assert.equal(t.needed, requiredCredit(19.99, 0.12));
  const play = (await mockSupplier.fetchSnapshot('US', 'play')).packages;
  assert.equal(t.credit, pickPackages(play, t.needed).faceValue);
  const { body: q } = await post('/api/quotes', { planId: 'pro_m', months: 1, store: 'play' });
  assert.ok(q.id && q.store === 'play');
});

test('API: euro storefront uses euro cards; no tax added where prices include it', async () => {
  const { body } = await get('/api/catalog?region=DE&store=appstore');
  const t = term(body, 'pro_m', 1);
  assert.equal(t.currency, 'EUR');
  assert.equal(t.needed, 22, 'DE prices include VAT');
  const de = (await mockSupplier.fetchSnapshot('DE', 'appstore')).packages;
  assert.equal(t.credit, pickPackages(de, 22).faceValue);
});

test('API: a region or store with no supplier cards has no price at all', async () => {
  const gb = (await get('/api/catalog?region=GB&store=appstore')).body; // no GB cards recorded
  assert.ok(gb.plans.every((p) => !p.available && p.terms.length === 0));
  const ca = (await get('/api/catalog?region=CA&store=appstore')).body;
  assert.ok(ca.plans.every((p) => !p.available));
  const regions = (await get('/api/regions')).body.regions.map((r) => r.code).sort();
  assert.deepEqual(regions, ['DE', 'US']);
  assert.equal((await post('/api/quotes', { planId: 'pro_m', months: 1 })).status, 200);
});

test('API: health reports where supplier data comes from and how old it is', async () => {
  const { body } = await get('/healthz');
  assert.equal(body.supplier.name, 'mock');
  assert.equal(body.supplier.live, false);
  const us = body.supplier.snapshots.find((s) => s.key === 'appstore:US');
  assert.match(us.source, /^fixture:bitrefill-storefront-/);
  assert.equal(us.fresh, true);
  const gb = body.supplier.snapshots.find((s) => s.key === 'appstore:GB');
  assert.match(gb.error, /no recorded cards/);
  assert.equal((await get('/api/config')).body.supplierLive, false);
});

test('startup: the mock supplier refuses to take real money on mainnet', async () => {
  for (const env of [
    { TON_NETWORK: 'mainnet', PAYMENT_MODE: 'mock', STARS: 'on', BOT_TOKEN: '123:abc' },
    { TON_NETWORK: 'mainnet', PAYMENT_MODE: 'chain', MERCHANT_WALLET: 'UQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAJKZ' },
  ]) {
    const p = spawn(process.execPath, ['--no-warnings', 'src/index.js'], { env: isolatedEnv({ PORT: '8962', ...env }) });
    let err = '';
    p.stderr.on('data', (d) => { err += d; });
    const code = await new Promise((r) => p.once('exit', r));
    assert.equal(code, 1, JSON.stringify(env));
    assert.match(err, /SUPPLIER=mock issues fake codes|MERCHANT_WALLET/);
  }
});
