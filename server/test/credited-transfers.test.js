import { test } from 'node:test';
import assert from 'node:assert/strict';
import { recentIncoming } from '../src/chain.js';
import { transfersFromNotification } from '../src/stream.js';

const merchant = '0:' + 'ab'.repeat(32);
const credited = () => ({
  hash: 'credited', account: merchant, orig_status: 'nonexist', end_status: 'uninit',
  in_msg: {
    source: '0:' + '12'.repeat(32), destination: merchant,
    value: '200000000', bounce: false, bounced: false,
    message_content: { decoded: { type: 'text_comment', comment: 'TS-CREDIT' } },
  },
  description: {
    type: 'ord', aborted: true, destroyed: false, credit_first: true,
    credit_ph: { credit: '200000000' },
    compute_ph: { skipped: true, reason: 'no_state' },
  },
});
const readers = {
  stream: async (_t, txs) => transfersFromNotification({ type: 'transactions', finality: 'finalized', transactions: txs }, merchant),
  poller: async (t, txs) => {
    t.mock.method(globalThis, 'fetch', async () => Response.json({ transactions: txs }));
    return recentIncoming(merchant);
  },
};

for (const [name, read] of Object.entries(readers)) {
  test(`${name}: accepts the confirmed non-bounceable credit to a fresh wallet`, async t => {
    const transfers = await read(t, [credited()]);
    assert.equal(transfers.length, 1);
    assert.equal(transfers[0].valueNano, 200000000n);
    assert.equal(transfers[0].comment, 'TS-CREDIT');
  });
  const invalid = {
    bounced: tx => { tx.in_msg.bounced = true; },
    bounceable: tx => { tx.in_msg.bounce = true; },
    'missing bounce flag': tx => { delete tx.in_msg.bounce; },
    'bounce phase': tx => { tx.description.bounce = { type: 'ok' }; },
    'missing credit': tx => { delete tx.description.credit_ph; },
    'zero credit': tx => { tx.description.credit_ph.credit = '0'; },
    'other compute failure': tx => { tx.description.compute_ph = { skipped: false, exit_code: 32 }; },
    'other skip reason': tx => { tx.description.compute_ph.reason = 'no_gas'; },
    'active account': tx => { tx.end_status = 'active'; },
    'wrong account': tx => { tx.account = '0:' + 'ef'.repeat(32); },
    'wrong destination': tx => { tx.in_msg.destination = '0:' + 'ef'.repeat(32); },
  };
  for (const [reason, mutate] of Object.entries(invalid)) {
    test(`${name}: rejects ${reason}`, async t => {
      const tx = credited();
      mutate(tx);
      assert.deepEqual(await read(t, [tx]), []);
    });
  }
}
