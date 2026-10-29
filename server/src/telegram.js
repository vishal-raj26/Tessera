// Validates Telegram Mini App initData (https://core.telegram.org/bots/webapps#validating-data-received-via-the-mini-app)
import crypto from 'node:crypto';

export function verifyInitData(initData, botToken, maxAgeSec = 24 * 3600) {
  if (!initData) return null;
  const params = new URLSearchParams(initData);
  const hash = params.get('hash');
  if (!hash) return null;
  params.delete('hash');
  const check = [...params.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join('\n');
  const secret = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
  const calc = crypto.createHmac('sha256', secret).update(check).digest('hex');
  if (calc.length !== hash.length || !crypto.timingSafeEqual(Buffer.from(calc), Buffer.from(hash))) return null;
  const authDate = Number(params.get('auth_date'));
  if (!authDate || Date.now() / 1000 - authDate > maxAgeSec) return null;
  try { return JSON.parse(params.get('user') || 'null'); } catch { return null; }
}

/** Express middleware: sets req.tgUser. In dev (no BOT_TOKEN) it trusts an optional x-dev-user header. */
export function telegramAuth(req, res, next) {
  const token = process.env.BOT_TOKEN;
  const initData = req.get('x-telegram-init-data');
  if (!token) {
    req.tgUser = { id: req.get('x-dev-user') || 'dev' };
    return next();
  }
  const user = verifyInitData(initData, token);
  if (!user) return res.status(401).json({ error: 'Open this app from Telegram to continue.' });
  req.tgUser = user;
  next();
}
