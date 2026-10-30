import { createRequire } from 'node:module';
const require = createRequire(new URL('../server/package.json', import.meta.url));
const { internal, SendMode } = require('@ton/core');

export async function sendPayment(contract, secretKey, to, nano, memo, {
  attempts = 60, delay = 2000, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const seqno = await contract.getSeqno();
  await contract.sendTransfer({
    seqno, secretKey, sendMode: SendMode.PAY_GAS_SEPARATELY | SendMode.IGNORE_ERRORS,
    messages: [internal({ to, value: BigInt(nano), body: memo, bounce: false })],
  });
  for (let i = 0; i < attempts; i++) {
    if ((await contract.getSeqno()) > seqno) return;
    if (i + 1 < attempts) await sleep(delay);
  }
  throw new Error(`Transfer ${memo} not confirmed; check the wallet before retrying`);
}
