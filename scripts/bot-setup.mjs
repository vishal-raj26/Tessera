#!/usr/bin/env node
// One-time Telegram bot setup.  Run from the project folder:   npm run bot:setup
//
// 1. Asks for your bot token (from @BotFather → /newbot) if server/.env doesn't have one, and saves it there.
// 2. Sets the bot's name, descriptions and command menus (buyers and admins get different ones).
// 3. Finds your Telegram user id (you send /start to the bot) and saves it as the admin.
// 4. Points the menu button at the Mini App when PUBLIC_URL is a real https URL (npm run live does this too).
//
// Safe to run again at any time. Stop the server first: only one program can read the bot's updates.
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';
import readline from 'node:readline';
import { parseEnv, setEnvText, moveSecrets } from './env-file.mjs';
import { BUYER_COMMANDS, ADMIN_COMMANDS } from './bot-commands.mjs';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const envFile = path.join(root, 'server', '.env');
const exampleFile = path.join(root, 'server', '.env.example');

// ---- .env helpers --------------------------------------------------------
if (!fs.existsSync(envFile)) fs.copyFileSync(exampleFile, envFile);

// .env.example is committed to a public repo; real values belong only in .env (git-ignored).
// If secrets were pasted into the example, move them into .env and blank them in the example.
{
  const r = moveSecrets(fs.readFileSync(exampleFile, 'utf8'), fs.readFileSync(envFile, 'utf8'));
  if (r.moved.length) {
    fs.writeFileSync(envFile, r.env);
    fs.writeFileSync(exampleFile, r.example);
    console.log(`✓ Moved ${r.moved.join(', ')} from .env.example (public) into .env (private)`);
  }
}
const readEnv = () => parseEnv(fs.readFileSync(envFile, 'utf8'));
const setEnv = (key, value) => fs.writeFileSync(envFile, setEnvText(fs.readFileSync(envFile, 'utf8'), key, value));

const ok = (s) => console.log(`✓ ${s}`);
const step = (s) => console.log(`\n▸ ${s}`);
// line reader that also works when answers are piped in
const rl = readline.createInterface({ input: process.stdin });
const lines = []; const waiting = []; let closed = false;
rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : lines.push(l)));
rl.on('close', () => { closed = true; while (waiting.length) waiting.shift()(''); });
const ask = (q) => { process.stdout.write(q); return lines.length ? Promise.resolve(lines.shift()) : closed ? Promise.resolve('') : new Promise((r) => waiting.push(r)); };

let env = readEnv();
let token = env.BOT_TOKEN;

// ---- token ---------------------------------------------------------------
if (!token) {
  console.log('No bot token yet. In Telegram, open @BotFather, send /newbot, pick a name and a username ending in "bot".');
  token = (await ask('Paste the token BotFather gives you: ')).trim();
}
const api = async (method, body = {}) => {
  const r = await fetch(`${process.env.TG_API || 'https://api.telegram.org'}/bot${token}/${method}`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) throw new Error(`${method}: ${j.description ?? r.status}`);
  return j.result;
};

let me;
try {
  me = await api('getMe');
} catch (e) {
  console.error(`✗ That token didn't work (${e.message}). Copy it again from @BotFather → /mybots → API Token.`);
  process.exit(1);
}
if (env.BOT_TOKEN !== token) setEnv('BOT_TOKEN', token);
ok(`Connected to @${me.username}`);

// polling and webhooks can't both be on
await api('deleteWebhook', { drop_pending_updates: false });

// ---- profile -------------------------------------------------------------
step('Profile');
const profile = [
  ['setMyName', { name: 'Tessera' }],
  ['setMyShortDescription', { short_description: 'Claude Pro and Max, paid with GRAM or Stars. Code in seconds.' }],
  ['setMyDescription', {
    description: 'Get a Claude Pro or Max plan without a card.\n\n'
      + '• Pick a plan and pay with GRAM from your wallet, or with Telegram Stars\n'
      + '• Your App Store credit code arrives in seconds\n'
      + '• Redeem it and upgrade in the Claude app\n\n'
      + 'Tap Start, then Open.',
  }],
];
for (const [m, body] of profile) {
  try { await api(m, body); } catch (e) { console.warn(`  ! ${e.message}`); } // name changes are rate limited
}
ok('Name, short description and description set');

// ---- buyer commands ------------------------------------------------------
await api('setMyCommands', { commands: BUYER_COMMANDS });
ok('Buyer commands: /start /paysupport /terms');

// ---- admin ---------------------------------------------------------------
step('Admin');
let admins = String(env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
if (!admins.length) {
  console.log(`Open https://t.me/${me.username} in Telegram and send /start. Waiting up to 2 minutes…`);
  let offset = 0;
  const until = Date.now() + 120_000;
  while (!admins.length && Date.now() < until) {
    const updates = await api('getUpdates', { offset, timeout: 20, allowed_updates: ['message'] });
    for (const u of updates) {
      offset = u.update_id + 1;
      const from = u.message?.from;
      if (from && u.message.chat?.type === 'private') {
        const yes = (await ask(`Make ${from.first_name ?? ''}${from.username ? ` (@${from.username})` : ''} [${from.id}] the admin? [Y/n] `)).trim().toLowerCase();
        if (yes === '' || yes === 'y' || yes === 'yes') admins = [String(from.id)];
        break;
      }
    }
  }
  // confirm those updates so the server doesn't replay them
  if (offset) await api('getUpdates', { offset, timeout: 0 });
  if (admins.length) setEnv('ADMIN_CHAT_IDS', admins.join(','));
}
if (admins.length) {
  for (const id of admins) {
    try {
      await api('setMyCommands', {
        scope: { type: 'chat', chat_id: Number(id) },
        commands: ADMIN_COMMANDS,
      });
      await api('sendMessage', { chat_id: id, text: 'You are the Tessera admin. Order alerts and buyer messages will arrive here once the server is running.' });
    } catch (e) {
      console.warn(`  ! admin ${id}: ${e.message} (send /start to the bot from that account, then run this again)`);
    }
  }
  ok(`Admin: ${admins.join(', ')} (alerts, /issues, /order, /prices, buyer messages)`);
} else {
  console.log('  No admin set. Send /start to the bot and run npm run bot:setup again.');
}

// ---- Mini App button -----------------------------------------------------
step('Mini App');
env = readEnv();
const pub = env.PUBLIC_URL || '';
if (/^https:\/\//.test(pub) && !pub.includes('example.com')) {
  await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open', web_app: { url: pub } } });
  ok(`Menu button opens ${pub}`);
} else {
  console.log('  No public URL yet. `npm run live` opens one and points the menu button at it each time.');
}

// ---- what only BotFather can do -------------------------------------------
console.log(`
Done. Two things only @BotFather can do (once):
  1. Picture: /setuserpic → @${me.username} → send web/public/icon-512.png as a photo.
  2. Main Mini App (when you have a permanent https URL): /mybots → @${me.username} → Bot Settings
     → Configure Mini App → Enable, and paste the URL. This gives the bot an "Open" button on its profile
     and lets links like https://t.me/${me.username}?startapp open the app directly.

Next: npm run live`);
rl.close();
