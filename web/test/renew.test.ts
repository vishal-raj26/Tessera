import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renewStep, type RenewState, type RenewTarget } from '../src/renew.ts';

const pro = (terms: number[], available = true) => ({ id: 'pro_m', available, terms: terms.map((months) => ({ months })) });
const max = { id: 'max5_m', available: true, terms: [{ months: 1 }, { months: 3 }, { months: 6 }] };
const appstore12: RenewTarget = { product: 'claude', store: 'appstore', planId: 'pro_m', months: 12 };
const base: RenewState = { catalogStore: 'appstore', store: 'appstore', productId: 'claude', plans: [pro([1, 3, 6, 12]), max], index: 0, months: 1 };

/** Apply steps like the app does, until it opens, fails or waits. */
function run(t: RenewTarget, s: RenewState) {
  const seen: string[] = [];
  for (let i = 0; i < 6; i++) {
    const step = renewStep(t, s);
    seen.push(step.do);
    if (step.do === 'index') s = { ...s, index: step.index };
    else if (step.do === 'months') s = { ...s, months: step.months };
    else return { end: step.do, seen, s };
  }
  throw new Error('no end');
}

test('(review P1, Codex repro) App Store Pro 12m while the Play catalog is loaded: waits, never opens Play or 6m', () => {
  // the screen already says App Store, but the loaded prices are still Google Play's (1/3/6 months only)
  const playLoaded: RenewState = { ...base, catalogStore: 'play', store: 'appstore', plans: [pro([1, 3, 6]), max] };
  assert.equal(renewStep(appstore12, playLoaded).do, 'wait');
  // the App Store catalog arrives: it selects Pro, then 12 months, then opens
  const r = run(appstore12, { ...playLoaded, catalogStore: 'appstore', plans: [max, pro([1, 3, 6, 12])], index: 0 });
  assert.equal(r.end, 'open');
  assert.deepEqual(r.seen, ['index', 'months', 'open']);
  assert.equal(r.s.index, 1);
  assert.equal(r.s.months, 12);
});

test('(review P1) the exact term must exist: no nearby term is ever opened', () => {
  const no12 = { ...base, plans: [pro([1, 3, 6]), max] };
  assert.deepEqual(run(appstore12, no12).end, 'fail');
  assert.equal(run({ ...appstore12, months: 3 }, no12).end, 'open');
});

test('(review P1) a store that is not priced, a different app, a missing or unavailable plan: fail, open nothing', () => {
  const play: RenewTarget = { ...appstore12, store: 'play', months: 1 };
  // Play's catalog loaded but the screen stayed on the App Store (Play has no prices)
  assert.equal(renewStep(play, { ...base, catalogStore: 'play', store: 'appstore' }).do, 'fail');
  assert.equal(renewStep({ ...appstore12, product: 'notely' }, base).do, 'fail');
  assert.equal(renewStep({ ...appstore12, planId: 'gone' }, base).do, 'fail');
  assert.equal(renewStep(appstore12, { ...base, plans: [pro([1, 3, 6, 12], false), max] }).do, 'fail');
});

test('nothing loaded yet: waits', () => {
  assert.equal(renewStep(appstore12, { ...base, plans: null }).do, 'wait');
  assert.equal(renewStep(appstore12, { ...base, catalogStore: null }).do, 'wait');
});
