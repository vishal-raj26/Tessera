import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setEnvText, moveSecrets, parseEnv } from '../../scripts/env-file.mjs';
import { BUYER_COMMANDS } from '../../scripts/bot-commands.mjs';
import { createBot } from '../src/bot.js';

const crlf = 'PORT=8787\r\nBOT_TOKEN=\r\nADMIN_CHAT_IDS=\r\nMARGIN=0.08\r\n';
const mixed = (t) => /\r\n/.test(t) && /(^|[^\r])\n/.test(t);

test('setEnvText keeps CRLF files CRLF (no mixed endings)', () => {
  let t = setEnvText(crlf, 'BOT_TOKEN', '123:abc');
  t = setEnvText(t, 'NEW_KEY', 'x');
  assert.equal(mixed(t), false);
  assert.equal(parseEnv(t).BOT_TOKEN, '123:abc');
  assert.equal(parseEnv(t).NEW_KEY, 'x');
  assert.ok(t.endsWith('NEW_KEY=x\r\n'));
  // and LF files stay LF
  const lf = setEnvText('A=1\n', 'B', '2');
  assert.equal(lf, 'A=1\nB=2\n');
  // a file without a final newline gets one in its own style
  assert.equal(setEnvText('A=1\r\nC=3', 'B', '2'), 'A=1\r\nC=3\r\nB=2\r\n');
});

test('moveSecrets on Windows files: moves the token, blanks the example, keeps CRLF, keeps an existing value', () => {
  const example = crlf.replace('BOT_TOKEN=', 'BOT_TOKEN=123:secret');
  const env = 'PAYMENT_MODE=chain\r\nADMIN_CHAT_IDS=55\r\n';
  const r = moveSecrets(example.replace('ADMIN_CHAT_IDS=', 'ADMIN_CHAT_IDS=99'), env);
  assert.deepEqual(r.moved, ['BOT_TOKEN', 'ADMIN_CHAT_IDS']);
  assert.equal(parseEnv(r.env).BOT_TOKEN, '123:secret');
  assert.equal(parseEnv(r.env).ADMIN_CHAT_IDS, '55', 'value already in .env wins');
  assert.equal(r.example, crlf);
  assert.equal(mixed(r.env), false);
  assert.equal(mixed(r.example), false);
});

test('live and bot:setup share the full buyer menu', () => {
  assert.deepEqual(BUYER_COMMANDS.map((c) => c.command), ['start', 'paysupport', 'terms']);
});

test('admin /start also gets the Open button', async () => {
  const calls = [];
  const bot = createBot({ api: async (m, b) => { calls.push(b); return {}; }, adminIds: ['1'], getEngine: () => null, orders: { get: () => null }, prices: null, publicUrl: 'https://x.test' });
  await bot.handleUpdate({ message: { text: '/start', from: { id: 1 }, chat: { id: 1, type: 'private' } } });
  assert.match(calls[0].text, /Admin mode/);
  assert.equal(calls[0].reply_markup.inline_keyboard[0][0].web_app.url, 'https://x.test');
});
