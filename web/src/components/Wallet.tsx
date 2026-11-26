// Your codes: every purchase as a plain row (plan, term, date, credit, and where it stands), the ones that
// still need you first and the redeemed ones folded below. Tap one to open it in place: its codes to
// redeem one at a time and how to activate, or what's happening with it.
import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { fmtMoney, planName, termLabel, type Order } from '../api';
import { RedeemCodes } from './RedeemCodes';
import { tg } from '../tg';
import { PLAN_LABEL } from './HoloCard';
import { Amount } from './Amount';

interface Props {
  orders: Order[] | null; // null while loading
  error: string | null;
  copied: string | null;
  onCopy: (code: string) => void;
  onMark: (o: Order, index: number, redeemed: boolean) => void;
  onRetry: () => void;
  onShop: () => void;
  onGuide: (o: Order) => void;
  onBack: () => void;
}

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

/** where a purchase stands, in a word or two, and how it reads (accent: needs you; quiet: settled) */
function statusOf(o: Order): { label: string; tone: 'act' | 'ok' | 'wait' | 'off' } {
  if (o.status === 'delivered') {
    const codes = o.codes ?? [];
    const left = codes.filter((c) => !c.redeemedAt).length;
    if (!codes.length) return { label: 'Ready', tone: 'ok' };
    if (!left) return { label: 'Redeemed', tone: 'off' };
    return { label: codes.length > 1 ? `${left} to redeem` : 'To redeem', tone: 'act' };
  }
  switch (o.status) {
    case 'awaiting_payment': return { label: o.paymentSeen ? 'Confirming' : 'Unpaid', tone: 'wait' };
    case 'paid': case 'fulfilling': return { label: 'Issuing', tone: 'wait' };
    case 'underpaid': return { label: 'Partly paid', tone: 'act' };
    case 'refunded': return { label: 'Refunded', tone: 'off' };
    case 'expired': return { label: 'Expired', tone: 'off' };
    default: return { label: 'Needs attention', tone: 'act' };
  }
}

function note(o: Order): string {
  switch (o.status) {
    case 'awaiting_payment': return o.paymentSeen ? 'Your payment is on its way. The code appears here once it confirms.' : 'No payment yet. If you sent one, it shows up here within a couple of minutes.';
    case 'paid': case 'fulfilling': return 'Payment confirmed. Your credit is being issued.';
    case 'underpaid': return o.error ?? 'Part of the payment arrived. Send the rest with the same memo to finish.';
    case 'refunded': return 'This order was refunded to your wallet.';
    case 'expired': return 'No payment arrived for this price. Late payments are still picked up for 2 hours.';
    default: return o.error ?? "Something went wrong issuing this credit. We've been notified and will sort it out.";
  }
}

export function Wallet({ orders, error, copied, onCopy, onMark, onRetry, onShop, onGuide, onBack }: Props) {
  const [open, setOpen] = useState<string | null>(null);
  const [showDone, setShowDone] = useState(false);
  useEffect(() => tg.back(open ? () => setOpen(null) : onBack), [open, onBack]);

  if (error && !orders) {
    return (
      <div className="list-state">
        <p>Couldn't load your codes.</p>
        <button className="btn btn-quiet" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (!orders) {
    return <div className="list">{[0, 1, 2].map((i) => <div key={i} className="list-ghost" />)}</div>;
  }

  if (orders.length === 0) {
    return (
      <div className="list-state">
        <p>Credit you buy shows up here, with its codes.</p>
        <button className="btn btn-pearl" onClick={onShop}>Choose a plan</button>
      </div>
    );
  }

  // what still needs you (codes to redeem, payments in progress or stuck) first; settled ones below,
  // folded away until asked for
  const settled = (o: Order) => statusOf(o).tone === 'off';
  const active = orders.filter((o) => !settled(o));
  const done = orders.filter(settled);

  const row = (o: Order, i: number) => {
    const st = statusOf(o);
    const isOpen = open === o.id;
    const name = planName(o.product?.name, { ...o.plan, label: o.plan.label ?? PLAN_LABEL[o.plan.id] });
    return (
      <motion.li key={o.id} className={`item ${isOpen ? 'is-open' : ''}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: Math.min(i, 8) * 0.04 }}>
        <button className="item-row" onClick={() => { tg.select(); setOpen(isOpen ? null : o.id); }} aria-expanded={isOpen}>
          <span className="item-main">
            <b>{name}</b>
            <span>{termLabel(o.months ?? 1)} · {fmtMoney(o.credit, o.currency)} {o.store?.label ?? 'App Store'} credit · {day(o.createdAt)}</span>
          </span>
          <span className={`item-status ${st.tone}`}>{st.label}</span>
          <svg className="item-chev" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <AnimatePresence initial={false}>
          {isOpen && (
            <motion.div className="item-body" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28, ease: [0.2, 0.8, 0.2, 1] }}>
              <div className="item-inner">
                <p className="item-paid">Paid <span className="amt"><Amount method={o.method} gram={o.gram} stars={o.stars} size={12} /></span></p>
                {o.codes?.length ? (
                  <>
                    <RedeemCodes order={o} copied={copied} onCopy={onCopy} onMark={onMark} />
                    <button className="text-btn" onClick={() => onGuide(o)}>How to activate</button>
                  </>
                ) : (
                  <>
                    <p className="item-note">{note(o)}</p>
                    {o.method !== 'stars' && (o.status === 'awaiting_payment' || o.status === 'underpaid') && <div className="memo">memo {o.comment}</div>}
                  </>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.li>
    );
  };

  return (
    <div className="groups">
      {active.length > 0 && (
        <section className="group">
          <h2 className="group-head">To redeem <span>{active.length}</span></h2>
          <ul className="list">{active.map(row)}</ul>
        </section>
      )}
      {done.length > 0 && (
        <section className="group">
          <button className="group-head group-toggle" onClick={() => { tg.select(); setShowDone(!showDone); }} aria-expanded={showDone}>
            Redeemed <span>{done.length}</span>
            <svg className={`group-chev ${showDone ? 'up' : ''}`} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
          </button>
          <AnimatePresence initial={false}>
            {(showDone || !active.length) && (
              <motion.ul className="list" initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.28 }} style={{ overflow: 'hidden' }}>
                {done.map(row)}
              </motion.ul>
            )}
          </AnimatePresence>
        </section>
      )}
    </div>
  );
}
