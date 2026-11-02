// Testnet charges TEST_PRICE_SCALE of the real price, GRAM and Stars alike, and says so in /api/config.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { isolatedEnv } from './isolated-env.js';

const servers = [];
after(async () => { for (const s of servers) { s.kill(); await new Promise((r) => (s.exitCode !== null ? r() : s.once('exit', r))); } });
const start = (port, env) => { servers.push(spawn(process.execPath, ['--no-warnings', 'src/index.js'], { env: isolatedEnv({ PORT: String(port), ...env }), stdio: 'ignore' })); };
const get = async (port, p) => {
  for (let i = 0; i < 60; i++) {
    try { return await (await fetch(`http://localhost:${port}${p}`)).json(); } catch { await new Promise((r) => setTimeout(r, 150)); }
  }
  throw new Error('server did not start');
};
start(8951, {});
start(8952, { TON_NETWORK: 'testnet', TEST_PRICE_SCALE: '0.01' });

test('testnet: GRAM and Stars are both charged at TEST_PRICE_SCALE, and the app is told the scale', async () => {
  const [real, test1] = await Promise.all([get(8951, '/api/catalog'), get(8952, '/api/catalog')]);
  assert.equal((await get(8952, '/api/config')).testScale, 0.01);
  assert.equal((await get(8951, '/api/config')).testScale, 1);
  const r = real.plans.find((p) => p.id === 'pro_m').terms[0];
  const t = test1.plans.find((p) => p.id === 'pro_m').terms[0];
  assert.ok(Math.abs(t.gram - r.gram * 0.01) <= 0.011, `${t.gram} vs ${r.gram}`);
  assert.equal(t.stars, Math.ceil(r.stars * 0.01));
  assert.equal(t.usd, r.usd, 'the real price stays known (the app shows the scaled one)');
});
