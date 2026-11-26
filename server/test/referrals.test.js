import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStore } from '../src/db.js';
import { createReferrals } from '../src/referrals.js';

const GRAM = 1_000_000_000n;

function setup(opts = {}) {
  const store = openStore(':memory:');
  let clock = 1_000_000;
  const refs = createReferrals({ db: store.db, margin: 0.08, share: 0.25, monthlyCapUsd: 25, now: () => clock, ...opts });
  let n = 0;
  const order = ({ user, wallet = null, gram = 28n, costUsd = 26.25, method = 'gram', status = 'delivered' }) => {
    const id = `o${++n}`;
    store.orders.insert({
      id, tgUserId: user, wallet, region: 'US', planId: 'pro_m', packages: [], faceValue: 25, currency: 'USD', costUsd,
      amountNano: (gram * GRAM).toString(), grossNano: (gram * GRAM).toString(), comment: `TS-${id}`, createdAt: clock, expiresAt: clock + 1, method,
    });
    store.orders.update(id, { status });
    return store.orders.get(id);
  };
  return { store, refs, order, tick: (ms) => { clock += ms; } };
}

test('a new user opening a friend’s link becomes theirs, once', () => {
  const { refs } = setup();
  const code = refs.codeFor('A');
  assert.equal(refs.codeFor('A'), code, 'the code is stable');
  assert.equal(refs.claim('B', `ref_${code}`, { isNew: true }), true);
  assert.equal(refs.referrerOf('B'), 'A');
  // a second link later never moves them
  const other = refs.codeFor('C');
  assert.equal(refs.claim('B', `ref_${other}`, { isNew: true }), false);
  assert.equal(refs.referrerOf('B'), 'A');
});

test('existing users, your own link and made-up codes don’t count', () => {
  const { refs } = setup();
  const code = refs.codeFor('A');
  assert.equal(refs.claim('B', `ref_${code}`, { isNew: false }), false);
  assert.equal(refs.claim('A', `ref_${code}`, { isNew: true }), false);
  assert.equal(refs.claim('D', 'ref_nosuchcode', { isNew: true }), false);
  assert.equal(refs.claim('D', 'something_else', { isNew: true }), false);
  assert.equal(refs.referrerOf('B'), null);
});

test('a friend’s delivered GRAM purchase gives the referrer 25% of our margin as credit', () => {
  const { refs, order } = setup();
  refs.claim('B', `ref_${refs.codeFor('A')}`, { isNew: true });
  const r = refs.reward(order({ user: 'B', gram: 108n }));
  // margin on 108 GRAM at 8% is 8 GRAM; a quarter of it is 2 GRAM
  assert.equal(r.referrer, 'A');
  assert.equal(r.nano, 2n * GRAM);
  assert.equal(refs.balanceNano('A'), 2n * GRAM);
  const s = refs.stats('A');
  assert.equal(s.invited, 1);
  assert.equal(s.bought, 1);
  assert.equal(s.earnedNano, String(2n * GRAM));
});

test('no reward twice for one order, for Stars, for undelivered orders, or without a referrer', () => {
  const { refs, order } = setup();
  refs.claim('B', `ref_${refs.codeFor('A')}`, { isNew: true });
  const o = order({ user: 'B', gram: 108n });
  assert.ok(refs.reward(o));
  assert.equal(refs.reward(o), null);
  assert.equal(refs.reward(order({ user: 'B', method: 'stars' })), null);
  assert.equal(refs.reward(order({ user: 'B', status: 'paid' })), null);
  assert.equal(refs.reward(order({ user: 'Z' })), null);
  assert.equal(refs.balanceNano('A'), 2n * GRAM);
});

test('paying from a wallet the referrer also uses earns nothing', () => {
  const { refs, order } = setup({ normalize: (w) => w.toLowerCase() });
  order({ user: 'A', wallet: 'EQwallet1' });
  refs.claim('B', `ref_${refs.codeFor('A')}`, { isNew: true });
  assert.equal(refs.reward(order({ user: 'B', wallet: 'eqWALLET1' })), null);
  assert.ok(refs.reward(order({ user: 'B', wallet: 'EQwallet2' })));
});

test('rewards stop at the monthly cap, and start again a month later', () => {
  const { refs, order, tick } = setup({ monthlyCapUsd: 1 });
  refs.claim('B', `ref_${refs.codeFor('A')}`, { isNew: true });
  // each order: 26.25 × 0.08 × 0.25 = $0.525
  assert.ok(refs.reward(order({ user: 'B' })));
  const second = refs.reward(order({ user: 'B' }));
  assert.ok(second, 'part of the second fits under the cap');
  assert.equal(refs.reward(order({ user: 'B' })), null, 'cap reached');
  tick(31 * 86400e3);
  assert.ok(refs.reward(order({ user: 'B' })));
});

test('credit comes off an order, and comes back if the order never goes through', () => {
  const { refs, order } = setup();
  refs.claim('B', `ref_${refs.codeFor('A')}`, { isNew: true });
  refs.reward(order({ user: 'B', gram: 108n })); // A has 2 GRAM
  assert.equal(refs.reserve('A', 'x1', 5n * GRAM), 2n * GRAM, 'takes what there is');
  assert.equal(refs.balanceNano('A'), 0n);
  assert.equal(refs.reserve('A', 'x2', 5n * GRAM), 0n, 'nothing left for a second order');
  assert.equal(refs.release('x1'), 2n * GRAM);
  assert.equal(refs.release('x1'), 0n, 'only once');
  assert.equal(refs.balanceNano('A'), 2n * GRAM);
  assert.equal(refs.reserve('A', 'x3', GRAM), GRAM, 'never more than the price');
  assert.equal(refs.balanceNano('A'), GRAM);
});
