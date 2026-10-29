import { test } from 'node:test';
import assert from 'node:assert/strict';
import { beginCell, Address } from '@ton/core';
import { readComment, friendly, commentPayload } from '../src/chain.js';

test('reads the comment from toncenter decoded content', () => {
  assert.equal(readComment({ decoded: { type: 'text_comment', comment: 'TS-ABC' } }), 'TS-ABC');
});

test('falls back to decoding the raw body', () => {
  assert.equal(readComment({ body: commentPayload('TS-ABC123') }), 'TS-ABC123');
});

test('ignores non-comment bodies', () => {
  const body = beginCell().storeUint(0x0f8a7ea5, 32).storeUint(1, 64).endCell().toBoc().toString('base64');
  assert.equal(readComment({ body }), null);
  assert.equal(readComment(undefined), null);
});

test('friendly address carries the testnet flag on testnet', () => {
  const raw = '0:' + 'ab'.repeat(32);
  const main = friendly(raw, 'mainnet');
  const test = friendly(raw, 'testnet');
  assert.ok(main.startsWith('UQ'));
  assert.ok(test.startsWith('0Q'));
  assert.equal(Address.parse(test).toRawString(), raw);
});
