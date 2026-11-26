// Referrals through the API (demo payments): a friend opens the app through A's link, buys with GRAM, A
// gets credit, and A's next GRAM order costs that much less. Credit that covers a whole order pays it.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { isolatedEnv } from './isolated-env.js';
import { openStore } from '../src/db.js';

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tessera-ref-'));
const dbFile = path.join(dir, 't.db');
const PORT = 8967;
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], { env: isolatedEnv({ PORT: String(PORT), DB_PATH: dbFile, MINIAPP_LINK: 'https://t.me/TestBot/app' }), stdio: 'ignore' });
after(async () => {
  srv.kill();
  await new Promise((r) => (srv.exitCode !== null ? r() : srv.once('exit', r)));
  fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
});
const call = async (p, { user, start, body } = {}) => {
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}${p}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', ...(user && { 'x-dev-user': user }), ...(start && { 'x-dev-start': start }) },
        ...(body && { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};
const waitFor = async (fn) => { for (let i = 0; i < 60; i++) { const v = await fn(); if (v) return v; await new Promise((r) => setTimeout(r, 150)); } throw new Error('timed out'); };
const buy = async (user, planId = 'pro_m') => {
  const q = (await call('/api/quotes', { user, body: { region: 'US', planId, months: 1 } })).body;
  const o = (await call('/api/orders', { user, body: { region: 'US', planId, months: 1, method: 'gram', quoteId: q.id } })).body;
  return { q, o };
};

test('API: the referral flow, from link to credit spent', async () => {
  const a = (await call('/api/referral', { user: '100' })).body;
  assert.match(a.link, /^https:\/\/t\.me\/TestBot\/app\?startapp=ref_[a-z0-9]+$/);
  assert.equal(a.invited, 0);
  assert.equal(a.balance, 0);

  // B opens Tessera through A's link for the first time
  await call('/api/me', { user: '200', start: `ref_${a.code}` });
  // A opening their own link, and an existing user opening it, change nothing
  await call('/api/me', { user: '100', start: `ref_${a.code}` });
  assert.equal((await call('/api/referral', { user: '100' })).body.invited, 1);

  // B buys and it's delivered: A earns 25% of our 8% margin
  const { o } = await buy('200');
  await call(`/api/orders/${o.id}/mock-pay`, { user: '200', body: {} });
  await waitFor(async () => (await call(`/api/orders/${o.id}`, { user: '200' })).body.status === 'delivered');
  const after = await waitFor(async () => { const r = (await call('/api/referral', { user: '100' })).body; return r.balance > 0 && r; });
  assert.equal(after.bought, 1);
  assert.ok(Math.abs(after.earned - (o.gram * 0.08 * 0.25) / 1.08) < 1e-6, `reward ${after.earned} for ${o.gram} GRAM`);

  // A's next order: the quote shows the credit, and the order asks for that much less
  const next = await buy('100');
  assert.ok(Math.abs(next.q.refCredit - after.balance) < 1e-9);
  assert.ok(Math.abs(next.o.refCredit - after.balance) < 1e-9);
  assert.ok(Math.abs(next.o.gram - (next.o.fullGram - after.balance)) < 1e-6);
  assert.equal((await call('/api/referral', { user: '100' })).body.balance, 0, 'credit is used up');
});

test('API: credit that covers the whole price pays the order by itself', async () => {
  // give user 300 plenty of credit directly in the ledger
  const s = openStore(dbFile);
  s.db.prepare("INSERT INTO credits (user_id, kind, amount_nano, usd, order_id, created_at) VALUES ('300','reward',?,0,'seed',?)").run(10_000 * 1e9, Date.now());
  s.db.close();
  const { o } = await buy('300');
  assert.equal(o.amountNano, '0');
  const done = await waitFor(async () => { const r = (await call(`/api/orders/${o.id}`, { user: '300' })).body; return r.status === 'delivered' && r; });
  assert.ok(done.codes.length > 0);
  const left = (await call('/api/referral', { user: '300' })).body.balance;
  assert.ok(Math.abs(left - (10_000 - done.fullGram)) < 1e-6);
});
