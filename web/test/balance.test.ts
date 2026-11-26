import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shownBalance } from '../src/balance.ts';

test('(review P2) balance: only the balance fetched for this exact wallet is shown', () => {
  const a = 'UQaaa', b = 'UQbbb';
  assert.equal(shownBalance({ address: a, gram: 12.4 }, a), 12.4);
  assert.equal(shownBalance({ address: a, gram: 12.4 }, b), null, 'switched to wallet B: A\'s funds never shown');
  assert.equal(shownBalance({ address: a, gram: 12.4 }, ''), null, 'disconnected');
  assert.equal(shownBalance(null, a), null);
});
