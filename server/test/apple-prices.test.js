import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { parsePrice, extractPrices, reviewPrices, startApplePriceSync, htmlToText } from '../src/applePrices.js';

test('parsePrice reads every storefront format', () => {
  const cases = { '$20.00': 20, '$124.99': 124.99, '£19.99': 19.99, '19,99 €': 19.99, '¥3,000': 3000, '₩33,000': 33000,
    '₹1,999.00': 1999, 'R$ 129,90': 129.9, 'Rp 349.000': 349000, 'Rp 3.999.000': 3999000, '1 299,00 ₽': 1299, "CHF 1'299.00": 1299, 'TRY 999,99': 999.99 };
  for (const [s, v] of Object.entries(cases)) assert.equal(parsePrice(s), v, s);
});

// The four Claude plans as the App Store lists them (US, 30 Oct 2026), in list markup like the page,
// surrounded by the usage-credit items that must be ignored.
const page = (p = {}) => `<html><head><script>{"x":"Claude Pro - Monthly $1.00 in a script must be ignored"}</script></head><body>
  <h2>In-App Purchases</h2><ul>
  <li><span class="title">Claude Pro - Monthly</span><span class="price">${p.pro_m ?? '$20.00'}</span></li>
  <li><span>Claude Max 5x - Monthly</span><span>${p.max5_m ?? '$124.99'}</span></li>
  <li><span>Claude Max 20x - Monthly</span><span>${p.max20_m ?? '$249.99'}</span></li>
  <li><span>Claude Pro - Annual</span><span>${p.pro_y ?? '$214.99'}</span></li>
  <li><span>Usage Credits (20)</span><span>$20.00</span></li><li><span>Usage Credits (50)</span><span>$45.00</span></li>
  </ul></body></html>`;

test('extractPrices finds the four plans and ignores scripts and usage credits', () => {
  assert.deepEqual(extractPrices(page()), { pro_m: 20, pro_y: 214.99, max5_m: 124.99, max20_m: 249.99 });
  const de = page({ pro_m: '22,99&nbsp;€', max5_m: '149,99 €', max20_m: '299,99 €', pro_y: '229,99 €' });
  assert.deepEqual(extractPrices(de), { pro_m: 22.99, pro_y: 229.99, max5_m: 149.99, max20_m: 299.99 });
  assert.deepEqual(extractPrices('<p>nothing here</p>'), {});
  assert.doesNotMatch(htmlToText(page()), /\$1\.00/);
});

test('reviewPrices refuses jumps over 2x and reports missing plans', () => {
  const r = reviewPrices({ pro_m: 22, max5_m: 900 }, { pro_m: 20, max5_m: 124.99, max20_m: 249.99 });
  assert.deepEqual(r.accept, { pro_m: 22 });
  assert.deepEqual(r.refused, { max5_m: { from: 124.99, to: 900 } });
  assert.deepEqual(r.missing, ['max20_m']);
});

test('sync: saves changes, tells the admin once, keeps old prices when the page breaks', async () => {
  const store = { pro_m: 20, pro_y: 214.99, max5_m: 124.99, max20_m: 249.99 };
  const events = [];
  let html = page({ pro_m: '$22.00' });
  const sync = startApplePriceSync({
    region: 'US', keys: () => Object.keys(store), get: (k) => store[k], save: (k, v) => { store[k] = v; },
    notify: (e) => events.push(e), fetchImpl: async () => new Response(html), log: {}, everyHours: 1000,
  });
  sync.stop();
  await new Promise((r) => setTimeout(r, 20)); // the first run starts on its own
  assert.equal(store.pro_m, 22);
  assert.equal(events.filter((e) => e.type === 'apple_prices_changed').length, 1);
  assert.deepEqual(events[0].changed, [{ key: 'pro_m', from: 20, to: 22 }]);

  await sync.run(); // nothing changed: no message
  assert.equal(events.length, 1);

  html = '<p>Something went wrong</p>';
  await sync.run();
  await sync.run(); // same problem twice: one alert
  assert.equal(store.pro_m, 22, 'kept');
  assert.equal(events.filter((e) => e.type === 'apple_prices_problem').length, 1);

  html = page({ pro_m: '$220.00' }); // implausible jump
  await sync.run();
  assert.equal(store.pro_m, 22, 'refused');
  assert.match(events.at(-1).problem, /refused/);
});

// End to end: the server syncs from a fake App Store page, holds quotes, and prices Stars near GRAM.
const PAGE_PORT = 8933, API = 8932;
let pageHtml = page({ pro_m: '$25.00' });
const fakeStore = http.createServer((req, res) => { res.writeHead(200, { 'content-type': 'text/html' }); res.end(pageHtml); });
await new Promise((r) => fakeStore.listen(PAGE_PORT, r));
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
  env: { ...process.env, PORT: String(API), DB_PATH: ':memory:', PAYMENT_MODE: 'mock', BOT_TOKEN: '', SUPPLIER: 'mock', STORE_REGION: 'US',
    APPLE_PAGE_URL: `http://localhost:${PAGE_PORT}/`, APPLE_PRICE_SYNC: 'on', GRAM_USD_FALLBACK: '1.5' },
  stdio: 'ignore',
});
after(() => { srv.kill(); fakeStore.close(); });
const call = async (path, body, user = 'u1') => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${API}${path}`, { method: body ? 'POST' : 'GET', headers: { 'content-type': 'application/json', 'x-dev-user': user }, ...(body && { body: JSON.stringify(body) }) });
      return { status: r.status, body: await r.json() };
    } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};

test('API: the synced App Store price is what we sell against', async () => {
  await new Promise((r) => setTimeout(r, 600));
  const { body } = await call('/api/catalog');
  const pro1 = body.plans.find((p) => p.id === 'pro_m').terms.find((t) => t.months === 1);
  assert.equal(pro1.appPrice, 25);
});

test('API: Stars cost about the same as GRAM but never less than our cost', async () => {
  const { body } = await call('/api/catalog');
  for (const p of body.plans) for (const t of p.terms) {
    const cost = t.usd / 1.08; // usd is cost x (1 + MARGIN)
    assert.ok(t.stars * 0.013 >= cost * 1.03 - 0.02, `${p.id} ${t.months}m covers cost`);
    assert.ok(t.stars >= Math.ceil(t.usd / 0.02), 'never cheaper for the buyer than GRAM');
  }
});

test('API: a held quote is what the order gets, for that buyer only', async () => {
  const q = await call('/api/quotes', { planId: 'max5_m', months: 3 });
  assert.equal(q.status, 200);
  pageHtml = page({ pro_m: '$25.00' }); // (prices could move meanwhile)
  const o = await call('/api/orders', { planId: 'max5_m', months: 3, method: 'gram', quoteId: q.body.id });
  assert.equal(o.body.gram, q.body.gram);
  assert.ok(o.body.expiresAt >= q.body.expiresAt - 1000);
  const other = await call('/api/orders', { planId: 'max5_m', months: 3, method: 'stars', quoteId: q.body.id }, 'someone-else');
  assert.equal(other.status, 200, 'falls back to a fresh quote');
  const mismatched = await call('/api/orders', { planId: 'pro_m', months: 1, method: 'gram', quoteId: q.body.id });
  assert.equal(mismatched.status, 200);
  assert.notEqual(mismatched.body.gram, q.body.gram, 'a quote for another plan is ignored');
});

test('a price never swallows the next item, even a whole number followed by "100 Credits"', () => {
  const name = { pro_m: /Claude\s+Pro\s*[-–—]\s*Monthly/i };
  assert.deepEqual(extractPrices('<li><span>Claude Pro - Monthly</span><span>¥3,000</span></li><li><span>100 Credits</span></li>', name), { pro_m: 3000 });
  assert.deepEqual(extractPrices('<li><span>Claude Pro - Monthly</span><span>$20</span></li><li><span>100 Credits</span><span>$4.00</span></li>', name), { pro_m: 20 });
  assert.deepEqual(extractPrices('<li>Claude Pro - Monthly <span>1&nbsp;299,00&nbsp;₽</span></li>', name), { pro_m: 1299 });
  assert.equal(parsePrice('29.99 100'), 29.99);
});
