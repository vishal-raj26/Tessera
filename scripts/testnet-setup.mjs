#!/usr/bin/env node
// Prepares server/.env for real testnet payments:
//   - creates a testnet merchant wallet to receive GRAM (keys saved to scripts/.testnet-merchant.json)
//   - sets PAYMENT_MODE=chain, TON_NETWORK=testnet, TEST_PRICE_SCALE=0.01
// Leaves any existing values you set (BOT_TOKEN, keys) alone.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import { createRequire } from 'node:module';

const here = path.dirname(url.fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../server/package.json'));
const { WalletContractV4 } = require('@ton/ton');
const { mnemonicNew, mnemonicToPrivateKey } = require('@ton/crypto');

const envFile = path.join(here, '../server/.env');
const lines = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8').split('\n') : [];
const get = (k) => lines.find((l) => l.startsWith(`${k}=`))?.slice(k.length + 1);
const set = (k, v, overwrite = true) => {
  const i = lines.findIndex((l) => l.startsWith(`${k}=`));
  if (i >= 0) { if (overwrite) lines[i] = `${k}=${v}`; } else lines.push(`${k}=${v}`);
};

const keyFile = path.join(here, '.testnet-merchant.json');
let mnemonic;
if (fs.existsSync(keyFile)) mnemonic = JSON.parse(fs.readFileSync(keyFile, 'utf8')).mnemonic;
else { mnemonic = await mnemonicNew(); fs.writeFileSync(keyFile, JSON.stringify({ mnemonic, note: 'TESTNET merchant wallet. Use it to refund test buyers.' }, null, 2)); }
const kp = await mnemonicToPrivateKey(mnemonic);
const merchant = WalletContractV4.create({ workchain: 0, publicKey: kp.publicKey }).address.toString({ testOnly: true, bounceable: false });

set('PAYMENT_MODE', 'chain');
set('TON_NETWORK', 'testnet');
set('MERCHANT_WALLET', get('TON_NETWORK') === 'testnet' && get('MERCHANT_WALLET') ? get('MERCHANT_WALLET') : merchant);
set('TEST_PRICE_SCALE', '0.01', false);
set('SUPPLIER', 'mock', false);
set('BOT_TOKEN', '', false);
set('ADMIN_CHAT_IDS', '', false);
set('TONCENTER_API_KEY', '', false);
fs.writeFileSync(envFile, lines.filter((l, i) => l || i < lines.length - 1).join('\n') + '\n');

console.log(`✓ server/.env set for testnet\n  merchant wallet: ${get('MERCHANT_WALLET')}`);
console.log('  Next: paste your bot token after BOT_TOKEN= and your Telegram user id after ADMIN_CHAT_IDS= in server/.env');
