#!/usr/bin/env node
// One command: build the Mini App, open a public HTTPS URL with a free Cloudflare quick tunnel
// (no account needed), start the server on that URL, and point your bot's menu button at it.
//
//   node scripts/live.mjs            (reads server/.env)
//
// Needs `cloudflared` installed (https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/).
// The quick-tunnel URL changes on every run; this script re-points the bot each time.
import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const root = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const server = path.join(root, 'server');
const web = path.join(root, 'web');

function loadEnv(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  return out;
}
const env = { ...loadEnv(path.join(server, '.env')), ...process.env };
const PORT = env.PORT || '8787';

function run(cmd, args, cwd) {
  const r = spawnSync(cmd, args, { cwd, stdio: 'inherit', shell: process.platform === 'win32' });
  if (r.status !== 0) { console.error(`✗ ${cmd} ${args.join(' ')} failed`); process.exit(1); }
}

console.log('▸ Installing and building…');
if (!fs.existsSync(path.join(server, 'node_modules'))) run('npm', ['install'], server);
if (!fs.existsSync(path.join(web, 'node_modules'))) run('npm', ['install'], web);
run('npm', ['run', 'build'], web);

const has = spawnSync('cloudflared', ['--version'], { shell: process.platform === 'win32' });
if (has.status !== 0) {
  console.error('✗ cloudflared is not installed. macOS: `brew install cloudflared`. Windows: `winget install Cloudflare.cloudflared`. Linux: see Cloudflare downloads.');
  process.exit(1);
}

console.log('▸ Opening an HTTPS tunnel…');
const tunnel = spawn('cloudflared', ['tunnel', '--no-autoupdate', '--url', `http://localhost:${PORT}`], { shell: process.platform === 'win32' });
const publicUrl = await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('tunnel did not start in 40s')), 40000);
  const scan = (d) => {
    const m = String(d).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    if (m) { clearTimeout(t); resolve(m[0]); }
  };
  tunnel.stdout.on('data', scan);
  tunnel.stderr.on('data', scan);
  tunnel.on('exit', (c) => reject(new Error(`cloudflared exited (${c})`)));
});
console.log(`✓ Public URL: ${publicUrl}`);

console.log('▸ Starting the server…');
const srv = spawn(process.execPath, ['--no-warnings', 'src/index.js'], {
  cwd: server, stdio: 'inherit', env: { ...env, PUBLIC_URL: publicUrl, WEB_DIST: path.join(web, 'dist') },
});

// wait for health, then wire up the bot
for (let i = 0; i < 40; i++) {
  try { if ((await fetch(`http://localhost:${PORT}/healthz`)).ok) break; } catch { /* starting */ }
  await new Promise((r) => setTimeout(r, 500));
}

if (env.BOT_TOKEN) {
  const api = async (method, body) => {
    const r = await fetch(`https://api.telegram.org/bot${env.BOT_TOKEN}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await r.json();
    if (!j.ok) throw new Error(`${method}: ${j.description}`);
    return j.result;
  };
  try {
    const me = await api('getMe', {});
    await api('setChatMenuButton', { menu_button: { type: 'web_app', text: 'Open', web_app: { url: publicUrl } } });
    await api('setMyCommands', { commands: [{ command: 'start', description: 'Open Tessera' }] });
    console.log(`✓ @${me.username} now opens ${publicUrl} from its menu button. Open Telegram → @${me.username} → Open.`);
  } catch (e) {
    console.warn(`! Could not set up the bot: ${e.message}`);
  }
} else {
  console.log('! No BOT_TOKEN in server/.env: the app works in a browser at the URL above, but not inside Telegram yet.');
}

const stop = () => { srv.kill(); tunnel.kill(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
srv.on('exit', () => { tunnel.kill(); process.exit(1); });
