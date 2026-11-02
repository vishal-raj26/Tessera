// Run: npm test (in web/). Uses Node's built-in TypeScript stripping.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMarkQueue, type Mark } from '../src/markQueue.ts';

// A fake server: requests wait until the test resolves or rejects them, in any order.
function rig() {
  let server: Mark = null; // what the server has
  let clock = 1000;
  const screen: Mark[] = [];
  const pending: { redeemed: boolean; resolve: () => void; reject: () => void; applied: boolean }[] = [];
  const failures: boolean[] = [];
  const q = createMarkQueue({
    send: (_o, _i, redeemed) => new Promise<Mark>((res, rej) => {
      const p = {
        redeemed, applied: false,
        resolve: () => { if (!p.applied) apply(); res(server); },
        reject: () => rej(new Error('offline')),
      };
      const apply = () => { p.applied = true; server = redeemed ? (server || ++clock) : null; };
      pending.push(p);
    }),
    show: (_o, _i, v) => { screen.push(v); },
    failed: (_o, _i, r) => { failures.push(r); },
    now: () => ++clock,
  });
  const settle = () => new Promise((r) => setTimeout(r, 0));
  return { q, pending, screen, failures, settle, get server() { return server; }, shown: () => screen.at(-1) ?? null };
}

test('tick then untick quickly: one request at a time, ends unticked like the server', async () => {
  const r = rig();
  r.q.mark('o', 0, null, true);   // A: Redeem
  r.q.mark('o', 0, r.shown(), false); // B: tap the tick off while A is in flight
  assert.equal(r.pending.length, 1, 'B waits for A');
  assert.equal(r.shown(), null, 'screen follows the latest tap');
  r.pending[0].resolve(); await r.settle(); // A lands: server ticked, B now sent
  assert.equal(r.pending.length, 2);
  assert.equal(r.pending[1].redeemed, false);
  r.pending[1].resolve(); await r.settle();
  assert.equal(r.server, null);
  assert.equal(r.shown(), null);
});

test('(Codex case 1) a late reply to an older save can never put the tick back', async () => {
  const r = rig();
  r.q.mark('o', 0, null, true);
  r.q.mark('o', 0, r.shown(), false);
  // A reaches the server; its reply comes back after the user's untick
  r.pending[0].resolve(); await r.settle();
  r.pending[1].resolve(); await r.settle();
  assert.equal(r.server, null);
  assert.equal(r.shown(), null, 'screen agrees with the server');
});

test('(Codex case 2) two failed saves while offline end on the server value, not a stale tick', async () => {
  const r = rig();
  r.q.mark('o', 0, null, true);
  r.q.mark('o', 0, r.shown(), false);
  r.q.mark('o', 0, r.shown(), true);
  assert.equal(r.pending.length, 1);
  r.pending[0].reject(); await r.settle();
  assert.equal(r.pending.length, 1, 'nothing more is sent after a failure');
  assert.equal(r.server, null);
  assert.equal(r.shown(), null, 'back to what the server has');
  assert.deepEqual(r.failures, [true]);
});

test('a single failed tick goes back off, and a later tap works', async () => {
  const r = rig();
  r.q.mark('o', 1, null, true);
  r.pending[0].reject(); await r.settle();
  assert.equal(r.shown(), null);
  r.q.mark('o', 1, null, true);
  r.pending[1].resolve(); await r.settle();
  assert.ok(r.server && r.shown() === r.server, 'screen shows the server timestamp');
});

test('taps that end where they started send nothing more', async () => {
  const r = rig();
  r.q.mark('o', 2, null, true);
  r.q.mark('o', 2, r.shown(), false);
  r.q.mark('o', 2, r.shown(), true);
  r.pending[0].resolve(); await r.settle();
  assert.equal(r.pending.length, 1, 'already where the user wants it');
  assert.ok(r.shown());
});

test('different codes save independently', async () => {
  const r = rig();
  r.q.mark('o', 0, null, true);
  r.q.mark('o', 1, null, true);
  assert.equal(r.pending.length, 2);
});
