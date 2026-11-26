import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trimAmt } from '../src/amount.ts';

test('coin amounts are shortened but never rounded down (Relay needs at least the quote)', () => {
  assert.equal(trimAmt('9.615119'), '9.615119');
  assert.equal(trimAmt('10.000000'), '10');
  assert.equal(trimAmt('9.500000'), '9.5');
  assert.equal(trimAmt('0.00569683073424198'), '0.005697'); // ETH: up, not 0.005696
  assert.equal(trimAmt('0.005696000'), '0.005696');          // exact: unchanged
  assert.equal(trimAmt('0.9999999'), '1');                    // carries into the whole part
  assert.equal(trimAmt('0.000123456789', 'BTC'), '0.00012346'); // BTC keeps 8 decimals
  assert.equal(trimAmt('12'), '12');
});
