// Support bot. Alerts the admin chat about orders that need a person (failed, underpaid,
// unmatched or extra payments) with Retry / Refund buttons, and keeps buyers informed.
// Uses the Telegram Bot API directly (long polling), no extra dependencies.
//
// Env: BOT_TOKEN (same bot as the Mini App), ADMIN_CHAT_IDS (comma-separated user or group ids).
// Admin commands: /issues — orders that need attention; /order <id or memo> — one order.
// Buyer commands: /start, /paysupport (required by Telegram for Stars), /terms.
// Support inbox: anything a buyer writes is forwarded to the admins; an admin replies to that
// forwarded message and the bot sends the answer back to the buyer.

export const TERMS = [
  '<b>Tessera terms of sale</b>',
  '',
  '• Tessera sells App Store credit. You use it to pay for a Claude plan in the Claude iOS app.',
  '• Codes work only on Apple accounts from the App Store country they are issued for.',
  '• Once a code is issued it cannot be refunded or exchanged.',
  '• If payment arrives but we can\'t issue your code, we refund you in the currency you paid with.',
  '• Claude plans renew monthly through Apple. Manage or cancel them in your Apple account settings.',
  '• Tessera is independent and not affiliated with Anthropic or Apple.',
  '',
  'Questions or a problem with a payment: /paysupport',
].join('\n');

const fromNano = (n) => (Number(BigInt(n ?? 0)) / 1e9).toFixed(2);
const PLAN = { pro_m: 'Pro', max5_m: 'Max 5×', max20_m: 'Max 20×' };
const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const isStars = (o) => o?.method === 'stars';
const term = (o) => (o?.months === 12 ? '1 year' : (o?.months ?? 1) === 1 ? '1 month' : `${o.months} months`);

function describe(o) {
  return [
    `<b>Claude ${PLAN[o.plan_id] ?? o.plan_id}, ${term(o)}</b> · ${o.currency} ${o.face_value} credit`,
    `Status: <b>${esc(o.status)}</b>`,
    isStars(o)
      ? `Paid with Stars: ${o.stars} ⭐${o.charge_id ? '' : ' (not paid yet)'}`
      : `Owed ${fromNano(o.amount_nano)} GRAM · received ${fromNano(o.received_nano)} GRAM`,
    `Memo <code>${esc(o.comment)}</code>`,
    o.charge_id ? `Charge <code>${esc(o.charge_id)}</code>` : o.tx_hash ? `Tx <code>${esc(o.tx_hash)}</code>` : null,
    o.wallet ? `Wallet <code>${esc(o.wallet)}</code>` : null,
    `Buyer <a href="tg://user?id=${esc(o.tg_user_id)}">${esc(o.tg_user_id)}</a>`,
    o.admin_note ? `Note: ${esc(o.admin_note)}` : null,
    `Order <code>${esc(o.id)}</code>`,
  ].filter(Boolean).join('\n');
}

function buttons(o) {
  const row = [];
  if (o.status === 'failed') row.push({ text: 'Retry', callback_data: `r:${o.id}` });
  if (isStars(o) && o.charge_id && ['failed', 'paid', 'expired'].includes(o.status)) row.push({ text: 'Refund Stars', callback_data: `f:${o.id}` });
  else if (!isStars(o) && ['failed', 'underpaid', 'expired', 'awaiting_payment', 'paid'].includes(o.status)) row.push({ text: 'Mark refunded', callback_data: `f:${o.id}` });
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
        if (e.stars != null) return toAdmins(`➕ <b>Unexpected Stars payment</b> of ${e.stars} ⭐\nCharge <code>${esc(e.hash)}</code>\n\n${describe(o)}`, buttons(o));
        return toAdmins(`➕ <b>Extra payment</b> of ${fromNano(e.valueNano)} GRAM\nTx <code>${esc(e.hash)}</code>\n\n${describe(o)}`, buttons(o));
      case 'credit_unrecognised':
        return toAdmins(`🔎 <b>Payment not recognised</b>: ${esc(e.reason)}\n${fromNano(e.valueNano)} GRAM · memo <code>${esc(e.comment)}</code>\nFrom <code>${esc(e.source)}</code>\nTx <code>${esc(e.hash)}</code>\nCheck it in an explorer. If the money arrived, fulfil or refund by hand.${o ? `\n\n${describe(o)}` : ''}`, o ? buttons(o) : undefined);
      case 'stars_unmatched':
        return toAdmins(`❓ <b>Stars payment for an unknown order</b>\n${e.amount} ⭐ from <a href="tg://user?id=${esc(e.userId)}">${esc(e.userId)}</a>\nOrder <code>${esc(e.orderId)}</code>\nCharge <code>${esc(e.chargeId)}</code>`);
      case 'unmatched':
        return toAdmins(`❓ <b>Payment with unknown memo</b>\nMemo <code>${esc(e.memo)}</code> · ${fromNano(e.valueNano)} GRAM\nFrom <code>${esc(e.source)}</code>\nTx <code>${esc(e.hash)}</code>`);
      case 'refunded':
        return toBuyer(o, isStars(o) ? `Your ${o.stars} Stars were refunded. Sorry it didn’t work out this time.` : 'Your order was refunded. Sorry it didn’t work out this time.');
      case 'renewal':
        if (o.months === 12) return toBuyer(o, `Your Claude ${PLAN[o.plan_id]} year renews in about 3 days. If your Apple balance won't cover it, Apple charges your card. You can top up in Tessera.`);
        if ((o.months ?? 1) > 1) return toBuyer(o, `The credit you bought for ${term(o)} of Claude ${PLAN[o.plan_id]} runs out in about 3 days. After that Apple charges your card for each month. You can top up in Tessera.`);
        return toBuyer(o, `Your Claude ${PLAN[o.plan_id]} month renews in about 3 days. If your Apple balance won't cover it, Apple charges your card. You can top up in Tessera.`);
      case 'rate_stale':
        return toAdmins(`⏸ <b>GRAM price feed is stale</b> (${e.minutes} min). New orders are paused until it recovers.`);
      case 'rate_ok':
        return toAdmins('▶️ GRAM price feed is back. Orders are open again.');
      default:
        return undefined;
    }
  }

  /** Stars invoice link for an order, opened in the Mini App with Telegram.WebApp.openInvoice. */
  function createInvoice(o) {
    return api('createInvoiceLink', {
      title: `Claude ${PLAN[o.plan_id]}, ${term(o)}`,
      description: `${o.currency} ${o.face_value} App Store credit for ${o.months === 12 ? 'a year' : term(o)} of Claude ${PLAN[o.plan_id]}. Code delivered in the app.`,
      payload: o.id,
      currency: 'XTR',
      prices: [{ label: `Claude ${PLAN[o.plan_id]}, ${term(o)}`, amount: o.stars }],
    });
  }

  async function handleUpdate(u) {
    // Stars checkout: Telegram asks before charging, then reports the payment
    const pq = u.pre_checkout_query;
    if (pq) {
      const error = pq.currency === 'XTR'
        ? getEngine().checkStars({ orderId: pq.invoice_payload, amount: pq.total_amount, userId: pq.from?.id })
        : 'Unsupported currency';
      return api('answerPreCheckoutQuery', { pre_checkout_query_id: pq.id, ok: !error, ...(error && { error_message: error }) });
    }
    const paid = u.message?.successful_payment;
    if (paid) {
      if (paid.currency !== 'XTR') return undefined;
      await getEngine().applyStars({
        orderId: paid.invoice_payload, amount: paid.total_amount,
        chargeId: paid.telegram_payment_charge_id, userId: u.message.from?.id,
      });
      return undefined;
    }

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
          reply_markup: { inline_keyboard: [[{ text: isStars(orders.get(id)) ? `Yes, refund ${orders.get(id)?.stars} Stars` : 'Yes, I refunded it', callback_data: `fc:${id}` }, { text: 'Cancel', callback_data: `x:${id}` }]] },
        });
      }
      if (act === 'fc') result = await refund(id, from);
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
        ? 'Admin mode.\n/issues — orders that need you\n/order &lt;id or memo&gt; — one order\n/prices — in-app prices we sell against\n/price &lt;plan&gt; &lt;amount&gt; — change one\n\nBuyer messages land here. Reply to one to answer that buyer.'
        : 'Claude Pro and Max, paid with GRAM or Stars.\nPick a plan, pay, and your code arrives in seconds.', openApp);
    }
    if (cmd.startsWith('/terms')) return send(chat, TERMS);
    if (cmd.startsWith('/paysupport') || cmd.startsWith('/help')) {
      return send(chat, 'Tell us what went wrong in one message, and include the memo of your order (it starts with TS-) if you have it. A person will reply here.');
    }

    // admin answering a forwarded buyer message
    const replyTo = m.reply_to_message?.text ?? '';
    const target = isAdmin && replyTo.match(/#u(\d+)/)?.[1];
    if (target && !cmd.startsWith('/')) {
      await send(target, `<b>Tessera support</b>\n${esc(m.text)}`);
      return send(chat, 'Sent.');
    }

    if (!isAdmin) {
      // buyer wrote something: hand it to a person with their recent orders
      if (m.chat?.type !== 'private' || cmd.startsWith('/')) return undefined;
      const recent = (orders.byUser?.(from) ?? []).slice(0, 3)
        .map((o) => `• ${PLAN[o.plan_id] ?? o.plan_id} · ${esc(o.status)} · <code>${esc(o.comment)}</code>`).join('\n');
      const who = [m.from?.first_name, m.from?.last_name].filter(Boolean).join(' ') || from;
      await toAdmins(`💬 <b>${esc(who)}</b>${m.from?.username ? ` @${esc(m.from.username)}` : ''} #u${from}\n${esc(m.text)}${recent ? `\n\n${recent}` : ''}\n\n<i>Reply to this message to answer.</i>`);
      return send(chat, 'Got it. A person will reply here soon.');
    }
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

  /** GRAM refunds are sent by hand, so we only record them. Stars go back to the buyer through Telegram first. */
  async function refund(id, by) {
    const o = orders.get(id);
    if (!o) return { ok: false, msg: 'Order not found' };
    if (!isStars(o)) return getEngine().markRefunded(id, `Refunded by admin ${by}`);
    if (o.status === 'delivered') return { ok: false, msg: 'Already delivered; refunding would double-pay' };
    if (!o.charge_id) return { ok: false, msg: 'No Stars payment on this order' };
    try {
      await api('refundStarPayment', { user_id: Number(o.tg_user_id), telegram_payment_charge_id: o.charge_id });
    } catch (e) {
      return { ok: false, msg: `Telegram refused the refund: ${e.message}` };
    }
    return getEngine().markRefunded(id, `${o.stars} Stars refunded by admin ${by}`);
  }

  return { notify, handleUpdate, createInvoice };
}

/** Real bot with long polling. Without BOT_TOKEN it only logs, so local demos still work. */
export function startAdminBot({ getEngine, orders, prices, publicUrl }) {
  const token = process.env.BOT_TOKEN;
  const adminIds = String(process.env.ADMIN_CHAT_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!token) {
    return {
      notify: (e) => { if (e.type !== 'delivered') console.log(`[admin] ${e.type}`, e.order?.id ?? e.memo ?? ''); },
      createInvoice: async () => null, // no bot: Stars runs in demo mode
    };
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
        const updates = await api('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query', 'pre_checkout_query'] });
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
