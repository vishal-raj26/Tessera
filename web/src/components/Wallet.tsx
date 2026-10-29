// "Your codes" as a card wallet. Every purchase is a card in a stack; tap one and it lifts to the
// top while the rest settle into a pile at the bottom. Pull the lifted card down to put it back.
import { AnimatePresence, motion, type PanInfo } from 'framer-motion';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { fmtMoney, groupCode, type Order } from '../api';
import { tg } from '../tg';
import { HoloCard, PLAN_LABEL } from './HoloCard';
import { Amount } from './Amount';

interface Props {
  orders: Order[] | null; // null while loading
  error: string | null;
  copied: string | null;
  onCopy: (code: string) => void;
  onRetry: () => void;
  onShop: () => void;
  onGuide: (o: Order) => void;
  onBack: () => void;
}

const PEEK = 62; // how much of each stacked card shows
const PILE = 46; // height of the pile when a card is lifted
const LIFT = 0.8; // scale of the lifted card

const day = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

function statusOf(o: Order): { label: string; tone: 'ok' | 'wait' | 'bad' } {
  switch (o.status) {
    case 'delivered': return { label: 'Ready', tone: 'ok' };
    case 'awaiting_payment': return { label: o.paymentSeen ? 'Confirming' : 'Unpaid', tone: 'wait' };
    case 'paid': case 'fulfilling': return { label: 'Issuing', tone: 'wait' };
    case 'underpaid': return { label: 'Partly paid', tone: 'wait' };
    case 'refunded': return { label: 'Refunded', tone: 'bad' };
    case 'expired': return { label: 'Expired', tone: 'bad' };
    default: return { label: 'Needs attention', tone: 'bad' };
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

export function Wallet({ orders, error, copied, onCopy, onRetry, onShop, onGuide, onBack }: Props) {
  const [sel, setSel] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);
  const [h, setH] = useState(600);
  const [cardH, setCardH] = useState(400);

  useLayoutEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setH(el.clientHeight);
      const w = Math.min(el.clientWidth * 0.78, 290);
      setCardH(w / 0.63);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [orders === null]); // eslint-disable-line react-hooks/exhaustive-deps

  // Telegram back button puts a lifted card back first, then leaves the wallet
  useEffect(() => tg.back(sel ? () => setSel(null) : onBack), [sel, onBack]);

  if (error && !orders) {
    return (
      <div className="wl-state">
        <p>Couldn't load your codes.</p>
        <button className="btn btn-quiet" onClick={onRetry}>Try again</button>
      </div>
    );
  }

  if (!orders) {
    return (
      <div className="wl" ref={box}>
        {[0, 1, 2].map((i) => (
          <motion.div key={i} className="wl-ghost" style={{ top: i * PEEK }} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.08 }} />
        ))}
      </div>
    );
  }

  if (orders.length === 0) {
    return (
      <div className="wl-state">
        <motion.div className="wl-empty" initial={{ rotate: -4, y: 16, opacity: 0 }} animate={{ rotate: -4, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 160, damping: 18 }} />
        <p>Credit you buy lives here.</p>
        <button className="btn btn-pearl" onClick={onShop}>Choose a plan</button>
      </div>
    );
  }

  const lifted = orders.find((o) => o.id === sel) ?? null;
  const others = orders.filter((o) => o.id !== sel);
  const stackH = (orders.length - 1) * PEEK + cardH + 24;

  function place(o: Order, i: number) {
    if (!lifted) return { y: i * PEEK, scale: 1, opacity: 1, z: i };
    if (o.id === lifted.id) return { y: 0, scale: LIFT, opacity: 1, z: 100 };
    const k = Math.min(others.indexOf(o), 3);
    return { y: h - PILE + k * 7, scale: 0.92 - k * 0.03, opacity: k > 2 ? 0 : 1, z: 10 - k };
  }

  function lift(id: string) {
    tg.tap('light');
    setSel((s) => (s === id ? null : id));
  }

  function release(_: unknown, info: PanInfo) {
    if (info.offset.y > 90 || info.velocity.y > 600) { tg.tap('soft'); setSel(null); }
  }

  return (
    <div className={`wl ${lifted ? 'is-lifted' : ''}`} ref={box}>
      <div className="wl-scroll" style={{ height: lifted ? h : Math.max(h, stackH) }}>
        {orders.map((o, i) => {
          const p = place(o, i);
          const st = statusOf(o);
          const isLifted = lifted?.id === o.id;
          return (
            <motion.button
              key={o.id}
              className="wl-card"
              style={{ zIndex: p.z, pointerEvents: lifted && !isLifted && others.indexOf(o) > 0 ? 'none' : 'auto' }}
              initial={{ y: i * PEEK + 120, opacity: 0 }}
              animate={{ y: p.y, scale: p.scale, opacity: p.opacity }}
              transition={{ type: 'spring', stiffness: 260, damping: 28 }}
              drag={isLifted ? 'y' : false}
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.05, bottom: 0.6 }}
              onDragEnd={release}
              onClick={() => (lifted && !isLifted ? setSel(null) : lift(o.id))}
              aria-label={`Claude ${PLAN_LABEL[o.plan.id]}, ${fmtMoney(o.credit, o.currency)}, ${st.label}`}
              aria-expanded={isLifted}
            >
              <HoloCard
                className="wlc"
                planId={o.plan.id}
                credit={fmtMoney(o.credit, o.currency)}
                reveal={o.status === 'delivered' ? 1 : 0}
                interactive={isLifted}
                top={<><span><b>{PLAN_LABEL[o.plan.id]}</b> · {day(o.createdAt)}</span><span className={`wl-tag ${st.tone}`}>{st.label}</span></>}
              />
            </motion.button>
          );
        })}
      </div>

      <AnimatePresence>
        {lifted && (
          <motion.div
            key={lifted.id}
            className="wl-detail"
            style={{ top: cardH * LIFT + 14, bottom: PILE + 10 }}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0, transition: { delay: 0.12, type: 'spring', stiffness: 260, damping: 26 } }}
            exit={{ opacity: 0, y: 12, transition: { duration: 0.15 } }}
          >
            <div className="wl-meta">
              <span>Claude {PLAN_LABEL[lifted.plan.id]} · {fmtMoney(lifted.credit, lifted.currency)}</span>
              <span className="amt"><Amount method={lifted.method} gram={lifted.gram} stars={lifted.stars} size={12} /></span>
            </div>
            {lifted.codes?.length ? (
              <>
                <div className="codes">
                  {lifted.codes.map((c, i) => (
                    <motion.button key={c.code} className={`code ${copied === c.code ? 'is-copied' : ''}`} onClick={() => onCopy(c.code)} whileTap={{ scale: 0.98 }}
                      initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.18 + i * 0.06 }}>
                      {groupCode(c.code)}
                      {lifted.codes!.length > 1 && <span className="amt-sm">{fmtMoney(c.value, lifted.currency)}</span>}
                      <span className="copy">{copied === c.code ? 'Copied' : 'Copy'}</span>
                    </motion.button>
                  ))}
                </div>
                <div className="wl-actions">
                  <button className="btn btn-pearl" onClick={() => { tg.tap('medium'); tg.openLink(`https://apps.apple.com/redeem?code=${lifted.codes![0].code}`); }}>Redeem</button>
                  <button className="btn btn-quiet" onClick={() => onGuide(lifted)}>How to activate</button>
                </div>
              </>
            ) : (
              <>
                <p className="wl-note">{note(lifted)}</p>
                {lifted.method !== 'stars' && (lifted.status === 'awaiting_payment' || lifted.status === 'underpaid') && <div className="memo">memo {lifted.comment}</div>}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
