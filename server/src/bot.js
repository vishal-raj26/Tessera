// Support bot. Alerts the admin chat about orders that need a person (failed, underpaid,
// unmatched or extra payments) with Retry / Refund buttons, and keeps buyers informed.
// Uses the Telegram Bot API directly (long polling), no extra dependencies.
//
// Env: BOT_TOKEN (same bot as the Mini App), ADMIN_CHAT_IDS (comma-separated user or group ids).
// Admin commands: /issues — orders that need attention; /order <id or memo> — one order.

const fromNano = (n) => (Number(BigInt(n ?? 0)) / 1e9).toFixed(2);
const PLAN = { pro_m: 'Pro', max5_m: 'Max 5×', max20_m: 'Max 20×' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

function describe(o) {
  return [
    `<b>Claude ${PLAN[o.plan_id] ?? o.plan_id}</b> · ${o.currency} ${o.face_value} credit`,
    `Status: <b>${esc(o.status)}</b>`,
    `Owed ${fromNano(o.amount_nano)} GRAM · received ${fromNano(o.received_nano)} GRAM`,
    `Memo <code>${esc(o.comment)}</code>`,
    o.tx_hash ? `Tx <code>${esc(o.tx_hash)}</code>` : null,
    o.wallet ? `Wallet <code>${esc(o.wallet)}</code>` : null,
    `Buyer <a href="tg://user?id=${esc(o.tg_user_id)}">${esc(o.tg_user_id)}</a>`,
    o.admin_note ? `Note: ${esc(o.admin_note)}` : null,
    `Order <code>${esc(o.id)}</code>`,
  ].filter(Boolean).join('\n');
}

function buttons(o) {
  const row = [];
  if (o.status === 'failed') row.push({ text: 'Retry', callback_data: `r:${o.id}` });
  if (['failed', 'underpaid', 'expired', 'awaiting_payment', 'paid'].includes(o.status)) row.push({ text: 'Mark refunded', callback_data: `f:${o.id}` });
  return row.length ? { inline_keyboard: [row] } : undefined;
}

export function createBot({ api, adminIds, getEngine, orders, prices, publicUrl }) {
  const admins = new Set(adminIds.map(String));
  const send = (chat_id, text, reply_markup) =>
    api('sendMessage', { chat_id, text, parse_mode: 'HTML', disable_web_page_preview: true, ...(reply_markup && { reply_markup }) })
      .catch((e) => console.warn('bot send failed:', e.message));
  const toAdmins = (text, markup) => Promise.all([...admins].map((id) => send(id, text, markup)));
  const openApp = publicUrl ? { inline_keyboard: [[{ text: 'Open Tessera', web_app: { url: publicUrl } }]] } : undefined;
  const toBuyer = (o, text) => (o?.tg_user_id && /^\d+$/.test(o.tg_user_id) ? send(o.tg_user_id, text, openApp) : Promise.resolve());

  async function notify(e) {
    const o = e.order;
    switch (e.type) {
      case 'delivered':
        return toBuyer(o, `Your Claude ${PLAN[o.plan_id]} credit is ready. Open Tessera to copy the code and redeem it.`);
      case 'failed':
        await toAdmins(`⚠️ <b>Fulfilment failed</b>\n${esc(e.reason ?? '')}\n\n${describe(o)}`, buttons(o));
        return toBuyer(o, 'We received your payment, but your code is taking longer than usual. We are on it and will message you here.');
      case 'underpaid':
        await toAdmins(`💸 <b>Underpaid</b>\n\n${describe(o)}`, buttons(o));
        return toBuyer(o, `We received ${fromNano(e.receivedNano)} of ${fromNano(o.amount_nano)} GRAM. Send the rest with the same memo (${o.comment}) to finish, or reply here for a refund.`);
      case 'extra':
        return toAdmins(`➕ <b>Extra payment</b> of ${fromNano(e.valueNano)} GRAM\nTx <code>${esc(e.hash)}</code>\n\n${describe(o)}`, buttons(o));
      case 'unmatched':
        return toAdmins(`❓ <b>Payment with unknown memo</b>\nMemo <code>${esc(e.memo)}</code> · ${fromNano(e.valueNano)} GRAM\nFrom <code>${esc(e.source)}</code>\nTx <code>${esc(e.hash)}</code>`);
      case 'refunded':
        return toBuyer(o, 'Your order was refunded. Sorry it didn’t work out this time.');
      case 'renewal':
        return toBuyer(o, `Your Claude ${PLAN[o.plan_id]} month renews in about 3 days. If your Apple balance won't cover it, Apple charges your card. You can top up with GRAM in Tessera.`);
      case 'rate_stale':
        return toAdmins(`⏸ <b>GRAM price feed is stale</b> (${e.minutes} min). New orders are paused until it recovers.`);
      case 'rate_ok':
        return toAdmins('▶️ GRAM price feed is back. Orders are open again.');
      default:
        return undefined;
    }
  }

  async function handleUpdate(u) {
    const cb = u.callback_query;
    if (cb) {
      const from = String(cb.from?.id);
      const chat = String(cb.message?.chat?.id);
      if (!admins.has(from) && !admins.has(chat)) return api('answerCallbackQuery', { callback_query_id: cb.id, text: 'Not allowed' });
      const [act, id] = String(cb.data || '').split(':');
      let result = { ok: false, msg: 'Unknown action' };
      if (act === 'r') result = await getEngine().retry(id);
      if (act === 'f') {
        // ask once more before marking refunded: it can't be undone from the bot
        await api('answerCallbackQuery', { callback_query_id: cb.id });
        return api('editMessageReplyMarkup', {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id,
          reply_markup: { inline_keyboard: [[{ text: 'Yes, I refunded it', callback_data: `fc:${id}` }, { text: 'Cancel', callback_data: `x:${id}` }]] },
        });
      }
      if (act === 'fc') result = getEngine().markRefunded(id, `Refunded by admin ${from}`);
      if (act === 'x') result = { ok: true, msg: 'Cancelled' };
      await api('answerCallbackQuery', { callback_query_id: cb.id, text: result.msg });
      const o = orders.get(id);
      if (o && cb.message) {
        await api('editMessageText', {
          chat_id: cb.message.chat.id, message_id: cb.message.message_id, parse_mode: 'HTML', disable_web_page_preview: true,
          text: `${result.ok ? '✅' : '⚠️'} ${esc(result.msg)}\n\n${describe(o)}`,
          ...(buttons(o) && { reply_markup: buttons(o) }),
        }).catch(() => {});
      }
      return undefined;
    }

    const m = u.message;
    if (!m?.text) return undefined;
    const from = String(m.from?.id);
    const chat = String(m.chat?.id);
    const isAdmin = admins.has(from) || admins.has(chat);
    const [cmd, arg] = m.text.trim().split(/\s+/);
    if (cmd.startsWith('/start')) {
      return send(chat, isAdmin
        ? 'Admin mode.\n/issues — orders that need you\n/order &lt;id or memo&gt; — one order\n/prices — in-app prices we sell against\n/price &lt;plan&gt; &lt;amount&gt; — change one'
        : 'Open Tessera to buy Claude with GRAM.', isAdmin ? undefined : openApp);
    }
    if (!isAdmin) return undefined;
    if (cmd.startsWith('/issues')) {
      const list = orders.byStatus('failed', 'underpaid');
      if (!list.length) return send(chat, 'Nothing needs attention.');
      for (const o of list.slice(0, 15)) await send(chat, describe(o), buttons(o));
      return undefined;
    }
    if (cmd.startsWith('/prices') && prices) {
      const rows = prices.list().map((p) => `${p.plan} · Claude ${p.name}: <b>${p.price} ${p.currency}</b>${p.overridden ? ' (set by you)' : ''}`);
      return send(chat, `In-app prices (${prices.region}):\n${rows.join('\n')}\n\nChange one: /price max5_m 129.99`);
    }
    if (cmd === '/price' && prices) {
      const [, plan, amount] = m.text.trim().split(/\s+/);
      const err = prices.set(prices.region, plan, Number(amount));
      return send(chat, err ?? `Updated: ${plan} is now ${Number(amount)} ${prices.list().find((p) => p.plan === plan)?.currency}. New quotes use it right away.`);
    }
    if (cmd.startsWith('/order')) {
      const o = arg && (orders.get(arg) || orders.byMemo(arg));
      return o ? send(chat, describe(o), buttons(o)) : send(chat, 'No order with that id or memo.');
    }
    return undefined;
  }

  return { notify, handleUpdate };
}

/** Real bot with long polling. Without BOT_TOKEN it only logs, so local demos still work. */
export function startAdminBot({ getEngine, orders, prices, publicUrl }) {
  const token = process.env.BOT_TOKEN;
  const adminIds = String(process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token) {
    return { notify: (e) => { if (e.type !== 'delivered') console.log(`[admin] ${e.type}`, e.order?.id ?? e.memo ?? ''); } };
  }
  const api = async (method, body) => {
    const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
    });
    const j = await res.json();
    if (!j.ok) throw new Error(`${method}: ${j.description}`);
    return j.result;
  };
  const bot = createBot({ api, adminIds, getEngine, orders, prices, publicUrl });
  if (!adminIds.length) console.warn('ADMIN_CHAT_IDS is empty: nobody will get order alerts');

  let offset = 0;
  (async function poll() {
    for (;;) {
      try {
        const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
        for (const u of updates) {
          offset = u.update_id + 1;
          await bot.handleUpdate(u).catch((e) => console.error('bot update failed', e));
        }
      } catch (e) {
        console.warn('bot poll failed:', e.message);
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  })();
  return bot;
}
