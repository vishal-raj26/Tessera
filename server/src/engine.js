// Order engine: matches incoming GRAM transfers to orders, fulfils paid orders, and routes
// anything unusual to a person. Pure of I/O details so it can be tested with fakes.
//
// Order statuses
//   awaiting_payment → paid → fulfilling → delivered
//   awaiting_payment → expired          (no payment in time; still matched up to LATE_MS after)
//   awaiting_payment → underpaid        (some GRAM arrived, not enough; a top-up with the same memo completes it)
//   fulfilling       → failed           (paid, but the supplier could not issue a code)
//   failed|underpaid → paid             (admin pressed Retry / payment completed)
//   *                → refunded         (admin marked it refunded)
// Payments that can't be applied (unknown memo, order already done, too late) are recorded and flagged.

export const LATE_MS = 2 * 3600e3;

const fromNano = (n) => Number(BigInt(n)) / 1e9;
const fmt = (n) => fromNano(n).toFixed(2);

export function createEngine({ orders, payments, supplier, fetchIncoming, notify = () => {}, now = () => Date.now(), log = console }) {
  async function fulfil(id) {
    if (!orders.transition(id, 'paid', 'fulfilling')) return false;
    const o = orders.get(id);
    try {
      const codes = await supplier.purchase({ regionCode: o.region, packages: o.packages, reference: o.id });
      orders.update(id, { codes, status: 'delivered', error: null, delivered_at: now() });
      log.log?.(`[order ${id}] delivered ${codes.length} code(s)`);
      notify({ type: 'delivered', order: orders.get(id) });
      return true;
    } catch (e) {
      log.error?.(`[order ${id}] fulfilment failed`, e);
      orders.update(id, {
        status: 'failed',
        error: 'We received your payment but could not issue the code yet. Support has been notified and will fix or refund it.',
        admin_note: `Supplier error: ${e?.message ?? e}`,
      });
      notify({ type: 'failed', order: orders.get(id), reason: String(e?.message ?? e) });
      return false;
    }
  }

  /** Apply one incoming transfer. Safe to call repeatedly with the same tx. */
  async function applyTransfer(t) {
    const memo = t.comment?.trim() || null;
    const o = memo ? orders.byMemo(memo) : null;
    const first = payments.record({ hash: t.hash, orderId: o?.id, memo, valueNano: t.valueNano, source: t.source });
    if (!first) return 'seen';

    if (!o) {
      if (memo?.startsWith('TS-')) notify({ type: 'unmatched', memo, valueNano: String(t.valueNano), hash: t.hash, source: t.source });
      return 'unmatched';
    }

    const total = payments.forOrder(o.id).reduce((s, p) => s + BigInt(p.value_nano), 0n);
    orders.update(o.id, { received_nano: total.toString() });

    const open = o.status === 'awaiting_payment' || o.status === 'underpaid' || (o.status === 'expired' && now() - o.expires_at < LATE_MS);
    if (!open) {
      // money arrived for an order that is already done, refunded, or expired long ago
      orders.update(o.id, { admin_note: `Extra payment ${fmt(t.valueNano)} GRAM (tx ${t.hash}) after status "${o.status}"` });
      notify({ type: 'extra', order: orders.get(o.id), valueNano: String(t.valueNano), hash: t.hash });
      return 'extra';
    }

    if (total < BigInt(o.amount_nano)) {
      orders.transition(o.id, ['awaiting_payment', 'expired', 'underpaid'], 'underpaid');
      const missing = BigInt(o.amount_nano) - total;
      orders.update(o.id, {
        error: `Received ${fmt(total)} of ${fmt(o.amount_nano)} GRAM. Send the remaining ${fmt(missing)} GRAM with the same memo, or contact support for a refund.`,
      });
      notify({ type: 'underpaid', order: orders.get(o.id), receivedNano: total.toString() });
      return 'underpaid';
    }

    orders.update(o.id, { tx_hash: t.hash, error: null });
    if (orders.transition(o.id, ['awaiting_payment', 'expired', 'underpaid'], 'paid')) {
      await fulfil(o.id);
      return 'paid';
    }
    return 'noop';
  }

  async function tick() {
    for (const o of orders.byStatus('awaiting_payment')) {
      if (now() > o.expires_at) orders.transition(o.id, 'awaiting_payment', 'expired');
    }
    if (!fetchIncoming) return;
    let txs;
    try { txs = await fetchIncoming(); } catch (e) { log.warn?.('payment poll failed:', e.message); return; }
    // oldest first, so top-ups are summed in order
    for (const t of [...txs].reverse()) await applyTransfer(t);
  }

  /** Admin: try fulfilment again for a failed order. */
  async function retry(id) {
    const o = orders.get(id);
    if (!o) return { ok: false, msg: 'Order not found' };
    if (!orders.transition(id, 'failed', 'paid')) return { ok: false, msg: `Can't retry an order that is "${o.status}"` };
    const ok = await fulfil(id);
    return { ok, msg: ok ? 'Delivered' : 'Still failing' };
  }

  /** Admin: record that the buyer was refunded outside the app. */
  function markRefunded(id, note = '') {
    const o = orders.get(id);
    if (!o) return { ok: false, msg: 'Order not found' };
    if (o.status === 'delivered') return { ok: false, msg: 'Already delivered; refunding would double-pay' };
    if (!orders.transition(id, ['failed', 'underpaid', 'expired', 'awaiting_payment', 'paid'], 'refunded')) {
      return { ok: false, msg: `Can't refund an order that is "${o.status}"` };
    }
    orders.update(id, { error: 'This order was refunded.', admin_note: note || 'Refunded by admin' });
    notify({ type: 'refunded', order: orders.get(id) });
    return { ok: true, msg: 'Marked refunded' };
  }

  /** Resume orders that were mid-flight when the process stopped. */
  async function resume() {
    for (const o of orders.byStatus('paid')) await fulfil(o.id);
    for (const o of orders.byStatus('fulfilling')) {
      // a crash during purchase: we can't know if the supplier charged us, so a person decides
      orders.transition(o.id, 'fulfilling', 'failed');
      orders.update(o.id, { admin_note: 'Interrupted during fulfilment; check the supplier before retrying' });
      notify({ type: 'failed', order: orders.get(o.id), reason: 'Interrupted during fulfilment' });
    }
  }

  /** A transfer was broadcast but isn't final yet: only tell the buyer we've seen it. */
  function seePending(t) {
    const o = t.comment ? orders.byMemo(t.comment.trim()) : null;
    if (o && !o.seen_at && (o.status === 'awaiting_payment' || o.status === 'expired' || o.status === 'underpaid')) {
      orders.update(o.id, { seen_at: now() });
    }
  }

  /** Nudge buyers shortly before their Claude month renews (once per order). */
  function remindRenewals(daysAfter = 27) {
    const due = orders.dueForReminder(now() - daysAfter * 86400e3);
    for (const o of due) {
      orders.update(o.id, { reminded_at: now() });
      notify({ type: 'renewal', order: o });
    }
    return due.length;
  }

  return { tick, applyTransfer, seePending, fulfil, retry, markRefunded, resume, remindRenewals };
}
