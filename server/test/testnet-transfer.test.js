import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WalletContractV4 } from '@ton/ton';
import { openContract, TupleReader, loadMessageRelaxed } from '@ton/core';
import { keyPairFromSeed } from '@ton/crypto';
import { sendPayment } from '../../scripts/testnet-transfer.mjs';

// Only the network provider is replaced; signing and wallet serialization are real.
function setup(advance = true) {
  const key = keyPairFromSeed(Buffer.alloc(32, 7));
  const wallet = WalletContractV4.create({ workchain: 0, publicKey: key.publicKey });
  let seqno = 1;
  let message;
  const provider = {
    getState: async () => ({ state: { type: 'active' }, balance: 1000000000n }),
    get: async () => ({ stack: new TupleReader([{ type: 'int', value: BigInt(seqno) }]) }),
    external: async body => { message = body; if (advance) seqno++; },
  };
  return { contract: openContract(wallet, () => provider), key, message: () => message };
}

test('signed buyer transfer preserves the quoted value by paying fees separately', async () => {
  const t = setup();
  await sendPayment(t.contract, t.key.secretKey, '0:' + 'ab'.repeat(32), 200000000n, 'TS-EXACT');
  const slice = t.message().beginParse();
  slice.skip(512 + 32 + 32 + 32); // signature, wallet ID, timeout, seqno
  assert.equal(slice.loadUint(8), 0); // send messages operation
  const mode = slice.loadUint(8);
  assert.equal(mode & 1, 1, 'forwarding fees must come from the sender balance');
  assert.equal(mode & 2, 2, 'external wallet sends must ignore per-message errors');
  const message = loadMessageRelaxed(slice.loadRef().beginParse());
  assert.equal(message.info.value.coins, 200000000n);
  assert.equal(message.info.bounce, false);
  const body = message.body.beginParse();
  assert.equal(body.loadUint(32), 0);
  assert.equal(body.loadStringTail(), 'TS-EXACT');
});

test('buyer stops when the wallet sequence number never advances', async () => {
  const t = setup(false);
  await assert.rejects(sendPayment(t.contract, t.key.secretKey,
    '0:' + 'ab'.repeat(32), 200000000n, 'TS-TIMEOUT',
    { attempts: 2, sleep: async () => {} }), /not confirmed/);
});
