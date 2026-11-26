// The top bar's wallet balance: read from TON Center, cached per address, validated, never in demo mode.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { walletBalance } from '../src/chain.js';
import { isolatedEnv } from './isolated-env.js';
import { Address } from '@ton/core';

const VALID = new Address(0, Buffer.alloc(32, 7)).toString({ bounceable: false });

test('walletBalance: nanograms to GRAM, cached per address, 404 means an empty new wallet', async () => {
  let calls = 0;
  const seen = [];
  const ok = async (url) => { calls++; seen.push(url); return new Response(JSON.stringify({ balance: '12400000000', status: 'active' }), { status: 200 }); };
  let t = 1000;
  assert.equal(await walletBalance('EQa', { fetchImpl: ok, now: () => t }), 12.4);
  assert.equal(await walletBalance('EQa', { fetchImpl: ok, now: () => t + 5000 }), 12.4);
  assert.equal(calls, 1, 'cached');
  t += 30_000;
  await walletBalance('EQa', { fetchImpl: ok, now: () => t });
  assert.equal(calls, 2, 'refetched after the cache expires');
  assert.match(seen[0], /\/walletInformation\?address=EQa&use_v2=false$/);
  assert.equal(await walletBalance('EQnew', { fetchImpl: async () => new Response('{}', { status: 404 }) }), 0);
  await assert.rejects(() => walletBalance('EQdown', { fetchImpl: async () => new Response('{}', { status: 502 }) }), /toncenter 502/);
});

const PORT = 8971;
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], { env: isolatedEnv({ PORT: String(PORT) }), stdio: 'ignore' });
after(async () => { srv.kill(); await new Promise((r) => (srv.exitCode !== null ? r() : srv.once('exit', r))); });
const get = async (p) => {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(`http://localhost:${PORT}${p}`); return { status: r.status, body: await r.json() }; } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};

test('API: /api/balance refuses a non-address and asks no chain in demo mode', async () => {
  assert.equal((await get('/api/balance?address=hello')).status, 400);
  const r = await get(`/api/balance?address=${encodeURIComponent(VALID)}`);
  assert.equal(r.status, 200);
  assert.equal(r.body.gram, null);
});
