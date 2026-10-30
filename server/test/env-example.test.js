// .env.example is committed to a public repo: it must never carry real credentials.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('server/.env.example has no secrets filled in', () => {
  const text = fs.readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
  for (const key of ['BOT_TOKEN', 'ADMIN_CHAT_IDS', 'TONCENTER_API_KEY', 'BITREFILL_API_ID', 'BITREFILL_API_SECRET', 'MERCHANT_WALLET']) {
    const value = text.match(new RegExp(`^\\s*${key}\\s*=(.*)$`, 'm'))?.[1]?.trim();
    assert.ok(!value, `${key} is filled in server/.env.example. Move it to server/.env (git-ignored) and leave it empty here.`);
  }
  assert.doesNotMatch(text, /\d{8,10}:[A-Za-z0-9_-]{30,}/, 'something that looks like a Telegram bot token is in server/.env.example');
});
