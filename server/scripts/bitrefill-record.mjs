// Records Bitrefill's real catalog responses for the stores and regions we sell, so the adapter's cost
// field can be verified instead of guessed. Read-only: GET requests only, nothing is bought.
//   npm run supplier:record                 (regions: STORE_REGION, default US)
//   npm run supplier:record -- US DE         (several regions)
// Needs BITREFILL_API_ID and BITREFILL_API_SECRET in server/.env. Writes the raw responses (no credentials)
// to server/test/fixtures/bitrefill/api-<date>.json and prints each package's numeric fields, which is
// where the cost must be. Then set BITREFILL_COST_FIELD and BITREFILL_COST_CURRENCY in server/.env.
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickProduct } from '../src/supplier/bitrefill.js';
import { REGIONS } from '../src/catalog.js';

const BASE = 'https://api.bitrefill.com/v2';
const id = process.env.BITREFILL_API_ID;
const secret = process.env.BITREFILL_API_SECRET;
if (!id || !secret) { console.error('Set BITREFILL_API_ID and BITREFILL_API_SECRET in server/.env first.'); process.exit(1); }
const auth = 'Basic ' + Buffer.from(`${id}:${secret}`).toString('base64');
const get = async (p) => {
  const res = await fetch(p.startsWith('http') ? p : BASE + p, { headers: { Authorization: auth } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`GET ${p} -> ${res.status} ${JSON.stringify(body).slice(0, 200)}`);
  return body;
};

const regions = process.argv.slice(2).map((r) => r.toUpperCase());
if (!regions.length) regions.push(String(process.env.STORE_REGION || 'US').toUpperCase());
const out = { recordedAt: new Date().toISOString(), kind: 'Bitrefill Business API responses (authenticated, read-only)', regions: {} };

const numericFields = (o, prefix = '') => Object.entries(o || {}).flatMap(([k, v]) =>
  v && typeof v === 'object' && !Array.isArray(v) ? numericFields(v, `${prefix}${k}.`)
    : (typeof v === 'number' || (typeof v === 'string' && v !== '' && !isNaN(Number(v))) ? [`${prefix}${k}=${v}`] : []));

for (const region of regions) {
  const currency = REGIONS[region]?.currency;
  if (!currency) { console.error(`Unknown region ${region}`); continue; }
  const list = [];
  let next = `/products?country=${region}&type=gift_card&limit=50`;
  for (let page = 0; next && page < 20; page++) { const b = await get(next); list.push(...(b.data || [])); next = b.meta?._next || null; }
  out.regions[region] = { listCount: list.length, stores: {} };
  for (const store of ['appstore', 'play']) {
    let product;
    try { product = pickProduct(list, { region, store, currency }); } catch (e) { out.regions[region].stores[store] = { error: e.message }; console.log(`${region} ${store}: ${e.message}`); continue; }
    const detail = await get(`/products/${encodeURIComponent(product.id)}`);
    out.regions[region].stores[store] = { listEntry: product, detail };
    const p = detail.data ?? detail;
    console.log(`\n${region} ${store}: ${p.id} (${p.country} ${p.currency}, in_stock=${p.in_stock}) range=${JSON.stringify(p.range ?? null)}`);
    for (const pk of p.packages || []) console.log(`  ${pk.package_id}: ${numericFields(pk).join('  ')}`);
  }
}

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'test', 'fixtures', 'bitrefill');
fs.mkdirSync(dir, { recursive: true });
const file = path.join(dir, `api-${out.recordedAt.slice(0, 10)}.json`);
fs.writeFileSync(file, JSON.stringify(out, null, 2));
console.log(`\nSaved ${path.relative(process.cwd(), file)}. Find the field that is our cost (in USD) per package above,`);
console.log('then set BITREFILL_COST_FIELD (e.g. price) and BITREFILL_COST_CURRENCY=USD in server/.env.');
