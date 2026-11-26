import { test } from 'node:test';
import assert from 'node:assert/strict';
import { latestCoverage, coverDays } from '../src/coverage.ts';
import type { Order } from '../src/api.ts';

const DAY = 86400e3;
const T0 = Date.UTC(2026, 10, 1);
const order = (over: Partial<Order>): Order => ({
  id: Math.random().toString(36), status: 'delivered', months: 1, createdAt: T0, deliveredAt: T0,
  plan: { id: 'pro_m', name: 'Pro', label: 'Pro', term: 'month' }, product: { id: 'claude', name: 'Claude', app: '' },
  store: { id: 'appstore', label: 'App Store', device: 'iPhone' },
  ...over,
} as Order);

test('cover days match the server reminder: 30 per month, 365 for the yearly plan', () => {
  assert.equal(coverDays(1), 30);
  assert.equal(coverDays(3), 90);
  assert.equal(coverDays(12), 365);
});

test('no delivered orders: a new buyer', () => {
  assert.equal(latestCoverage(null), null);
  assert.equal(latestCoverage([order({ status: 'awaiting_payment' })], T0), null);
});

test('days left from the latest plan; later purchases of the same plan stack', () => {
  assert.equal(latestCoverage([order({})], T0 + 10 * DAY)!.daysLeft, 20);
  // bought another month after 10 days: it starts when the first runs out
  const two = [order({}), order({ createdAt: T0 + 10 * DAY, deliveredAt: T0 + 10 * DAY })];
  assert.equal(latestCoverage(two, T0 + 10 * DAY)!.daysLeft, 50);
  // a gap: credit bought after the first ran out starts on its own date
  const gap = [order({}), order({ createdAt: T0 + 40 * DAY, deliveredAt: T0 + 40 * DAY, months: 3 })];
  assert.equal(latestCoverage(gap, T0 + 40 * DAY)!.daysLeft, 90);
});

test('the latest plan wins; other plans and stores do not add up', () => {
  const mixed = [order({ months: 6 }), order({ plan: { id: 'max5_m', name: 'Max 5x', label: 'Max 5×', term: 'month' }, deliveredAt: T0 + DAY, createdAt: T0 + DAY })];
  const c = latestCoverage(mixed, T0 + DAY)!;
  assert.equal(c.order.plan.id, 'max5_m');
  assert.equal(c.daysLeft, 30);
  const stores = [order({ months: 6 }), order({ store: { id: 'play', label: 'Google Play', device: 'Android' }, deliveredAt: T0 + DAY, createdAt: T0 + DAY })];
  assert.equal(latestCoverage(stores, T0 + DAY)!.daysLeft, 30);
});

test('ran out: shown as negative days for a month, then treated as a new buyer', () => {
  assert.equal(latestCoverage([order({})], T0 + 35 * DAY)!.daysLeft, -5);
  assert.equal(latestCoverage([order({})], T0 + 61 * DAY), null);
});

test('older orders without deliveredAt fall back to when they were created', () => {
  assert.equal(latestCoverage([order({ deliveredAt: null })], T0 + 3 * DAY)!.daysLeft, 27);
});
