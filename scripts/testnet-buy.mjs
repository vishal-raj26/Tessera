#!/usr/bin/env node
// Real purchases on the TON testnet, end to end, against your running server.
//
//   node scripts/testnet-buy.mjs
//
// 1. Creates a throwaway testnet buyer wallet (saved to scripts/.testnet-buyer.json, never use it on mainnet).
// 2. Waits until you fund it (send ~2 testnet GRAM from @testgiver_ton_bot to the address it prints).
// 3. Buys through your app's API with real testnet transfers:
//      a) exact payment → delivered
//      b) underpay 60%, then top up the rest with the same memo → delivered
// Server must run with PAYMENT_MODE=chain and TON_NETWORK=testnet (TEST_PRICE_SCALE=0.01 keeps each buy cheap).
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { sendPayment } from './testnet-transfer.mjs';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../server/package.json'));
const { TonClient, WalletContractV4, toNano, fromNano } = require('@ton/ton');
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = { ...loadEnv(path.join(here, '../server/.env')), ...process.env };
const API = env.API_URL || `http://localhost:${env.PORT || 8787}`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// --- auth: sign Telegram initData for a test user with the bot token, like Telegram would ---
function initData(userId = 777000001) {
  if (!env.BOT_TOKEN) return '';
  const params = new URLSearchParams({ auth_date: String(Math.floor(Date.now() / 1000)), user: JSON.stringify({ id: userId, first_name: 'Testnet' }) });
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(env.BOT_TOKEN).digest();
  params.set('hash', crypto.createHmac('sha256', secret).update(check).digest('hex'));
  return params.toString();
}
const call = async (p, init = {}) => {
  const r = await fetch(API + p, { ...init, headers: { 'content-type': 'application/json', 'x-telegram-init-data': initData(), 'x-dev-user': '777000001' } });
  const j = await r.json();
  if (!r.ok) throw new Error(`${p}: ${j.error || r.status}`);
  return j;
};

// --- wallet ---
const walletFile = path.join(here, '.testnet-buyer.json');
let mnemonic;
if (fs.existsSync(walletFile)) mnemonic = JSON.parse(fs.readFileSync(walletFile, 'utf8')).mnemonic;
else { mnemonic = await mnemonicNew(); fs.writeFileSync(walletFile, JSON.stringify({ mnemonic, note: 'TESTNET ONLY' }, null, 2)); }
const key = await mnemonicToPrivateKey(mnemonic);
const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
const client = new TonClient({ endpoint: 'https://testnet.toncenter.com/api/v2/jsonRPC', apiKey: env.TONCENTER_API_KEY || undefined });
const contract = client.open(wallet);
const addr = wallet.address.toString({ testOnly: true, bounceable: false });

// --- preflight ---
const cfg = await call('/api/config');
if (cfg.paymentMode !== 'chain' || cfg.network !== 'testnet') {
  console.error(`✗ Server is in ${cfg.paymentMode}/${cfg.network}. Set PAYMENT_MODE=chain and TON_NETWORK=testnet in server/.env and restart.`);
  process.exit(1);
}
console.log(`Merchant (receives): ${cfg.merchant}`);
console.log(`Buyer (this script): ${addr}`);

const catalog = await call('/api/catalog');
const plan = catalog.plans.find((p) => p.id === 'pro_m');
const need = toNano((plan.gram * 2 + 0.2).toFixed(2));
let bal = await contract.getBalance();
if (bal < need) {
  console.log(`\n→ Send at least ${fromNano(need)} testnet GRAM to ${addr}`);
  console.log('  (Telegram: @testgiver_ton_bot, paste the address). Waiting…');
  while ((bal = await contract.getBalance()) < need) await sleep(5000);
}
console.log(`✓ Funded: ${fromNano(bal)} GRAM\n`);

async function send(to, nano, memo) {
  await sendPayment(contract, key.secretKey, to, nano, memo);
}
async function waitStatus(id, want, ms = 180000) {
  const end = Date.now() + ms;
  let last;
  while (Date.now() < end) {
    last = await call(`/api/orders/${id}`);
    if (want.includes(last.status)) return last;
    await sleep(2000);
  }
  throw new Error(`order ${id} stuck at "${last?.status}"`);
}

let ok = true;
try {
  // a) exact payment
  const a = await call('/api/orders', { method: 'POST', body: JSON.stringify({ planId: 'pro_m', wallet: addr }) });
  console.log(`a) Exact payment: ${a.gram} GRAM, memo ${a.comment}`);
  const t0 = Date.now();
  await send(a.merchant, a.amountNano, a.comment);
  const seen = await (async () => { for (let i = 0; i < 30; i++) { const o = await call(`/api/orders/${a.id}`); if (o.paymentSeen) return Date.now() - t0; await sleep(1000); } return null; })();
  const da = await waitStatus(a.id, ['delivered', 'failed']);
  console.log(`   ${da.status === 'delivered' ? '✓' : '✗'} ${da.status}${seen ? ` · seen after ${(seen / 1000).toFixed(1)}s` : ''} · total ${((Date.now() - t0) / 1000).toFixed(1)}s · codes ${da.codes?.map((c) => c.code).join(', ')}`);
  ok &&= da.status === 'delivered';

  // b) underpay, then top up
  const b = await call('/api/orders', { method: 'POST', body: JSON.stringify({ planId: 'pro_m', wallet: addr }) });
  const part = (BigInt(b.amountNano) * 60n) / 100n;
  console.log(`b) Underpay then top up: ${b.gram} GRAM, memo ${b.comment}`);
  await send(b.merchant, part, b.comment);
  const ub = await waitStatus(b.id, ['underpaid']);
  console.log(`   ✓ underpaid · "${ub.error}"`);
  await send(b.merchant, BigInt(b.amountNano) - part, b.comment);
  const db = await waitStatus(b.id, ['delivered', 'failed']);
  console.log(`   ${db.status === 'delivered' ? '✓' : '✗'} ${db.status} after top-up`);
  ok &&= db.status === 'delivered';
} catch (e) {
  ok = false;
  console.error(`✗ ${e.message}`);
}
console.log(`\n${ok ? 'TESTNET PURCHASES OK' : 'TESTNET PURCHASES FAILED'} · buyer balance ${fromNano(await contract.getBalance())} GRAM`);
process.exit(ok ? 0 : 1);
