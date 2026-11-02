import { test } from 'node:test';
import assert from 'node:assert/strict';
import { decideMosaic } from '../src/opening.ts';
import { shownBalance } from '../src/balance.ts';

test('opening: plays once per session, never with Reduce Motion, once when there is no storage', () => {
  let stored: string | null = null;
  const storage = { get: () => stored, set: () => { stored = '1'; } };
  assert.equal(decideMosaic(true, storage), false, 'reduce motion');
  assert.equal(stored, null, 'and the session is not used up');
  assert.equal(decideMosaic(false, storage), true);
  assert.equal(decideMosaic(false, storage), false, 'second time in the session');
  assert.equal(decideMosaic(false, null), true);
});

test('(review P2) balance: only the balance fetched for this exact wallet is shown', () => {
  const a = 'UQaaa', b = 'UQbbb';
  assert.equal(shownBalance({ address: a, gram: 12.4 }, a), 12.4);
  assert.equal(shownBalance({ address: a, gram: 12.4 }, b), null, 'switched to wallet B: A\'s funds never shown');
  assert.equal(shownBalance({ address: a, gram: 12.4 }, ''), null, 'disconnected');
  assert.equal(shownBalance(null, a), null);
});
