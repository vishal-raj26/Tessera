import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, animate, motion, useMotionValue } from 'framer-motion';
import { CHAIN, useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { api, fmtGram, fmtMoney, groupCode, type AppConfig, type Order, type PayMethod, type Plan } from './api';
import { tg } from './tg';
import { HoloCard, PLAN_LABEL } from './components/HoloCard';
import { PlanCarousel } from './components/PlanCarousel';
import { Sheet } from './components/Sheet';
import { Guide } from './components/Guide';
import { GramIcon } from './components/GramIcon';
import { Header } from './components/Header';
import { Rolling } from './components/Rolling';
import { Onboarding } from './components/Onboarding';
import { Wallet } from './components/Wallet';
import { Amount } from './components/Amount';
import { StarIcon } from './components/StarIcon';

type View = 'home' | 'paying' | 'done' | 'wallet';
type SheetName = null | 'review' | 'guide';

const rise = (delay = 0) => ({
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { type: 'spring' as const, stiffness: 200, damping: 24, delay },
});

export default function App() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [plans, setPlans] = useState<Plan[] | null>(null);
  const [pricesUpdating, setPricesUpdating] = useState(false);
  const [index, setIndex] = useState(0);
  const [view, setView] = useState<View>('home');
  const [sheet, setSheet] = useState<SheetName>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [history, setHistory] = useState<Order[] | null>(null);
  const [historyErr, setHistoryErr] = useState<string | null>(null);
  const [guideFor, setGuideFor] = useState<Order | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [lost, setLost] = useState(0); // consecutive failed polls while paying
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [walletSent, setWalletSent] = useState(false);
  const [holdUntil, setHoldUntil] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [flipped, setFlipped] = useState(true);
  const [settled, setSettled] = useState(false);
  const reveal = useMotionValue(0);
  const [intro, setIntro] = useState<boolean | null>(null); // null while we check
  const [canHome, setCanHome] = useState(false);
  useEffect(() => {
    if (new URLSearchParams(location.search).has('intro')) { setIntro(true); return; }
    tg.getFlag('onboarded').then((seen) => setIntro(!seen));
  }, []);
  const finishIntro = useCallback(() => { tg.setFlag('onboarded'); setIntro(false); }, []);
  const prevIndex = useRef(0);

  const [tonConnectUI] = useTonConnectUI();
  const wallet = useTonAddress();

  const [bootErr, setBootErr] = useState(false);
  const load = useCallback(() => {
    setBootErr(false);
    api.config()
      .then((c) => { setConfig(c); return api.catalog(c.region); })
      .then((c) => { setPlans(c.plans); setPricesUpdating(!!c.pricesUpdating); })
      .catch(() => setBootErr(true));
  }, []);
  useEffect(() => { tg.boot(); load(); }, [load]);

  // connection state: show a quiet bar when offline, reload what failed when it comes back
  useEffect(() => {
    const up = () => { setOnline(true); setLost(0); if (!plans) load(); };
    const down = () => setOnline(false);
    addEventListener('online', up);
    addEventListener('offline', down);
    return () => { removeEventListener('online', up); removeEventListener('offline', down); };
  }, [plans, load]);

  const plan = plans?.[index];
  // how to pay: the buyer's last choice, but only offer what this plan can be paid with right now
  const [method, setMethod] = useState<PayMethod>(() => { try { return localStorage.getItem('pay') === 'stars' ? 'stars' : 'gram'; } catch { return 'gram'; } });
  const payWith: PayMethod = !config?.stars || !plan?.stars ? 'gram' : plan?.gram == null ? 'stars' : method;
  const bothMethods = !!config?.stars && plan?.gram != null && plan?.stars != null;
  function chooseMethod(m: PayMethod) {
    if (m === method) return;
    tg.select(); setMethod(m); setErr(null);
    try { localStorage.setItem('pay', m); } catch { /* ignore */ }
  }
  const needsWallet = config?.paymentMode === 'chain' && !wallet && payWith === 'gram';
  const closeSheet = useCallback(() => setSheet(null), []);
  const rollDir = index >= prevIndex.current ? 1 : -1;
  useEffect(() => { prevIndex.current = index; }, [index]);

  const home = useCallback(() => {
    setView('home'); setOrder(null); setErr(null); setSheet(null);
  }, []);
  const toHome = useCallback(() => { setView('home'); setSheet(null); }, []);
  useEffect(() => (view === 'done' && !sheet ? tg.back(home) : undefined), [view, sheet, home]);

  useEffect(() => {
    if (sheet !== 'review') return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [sheet]);
  const left = Math.max(0, Math.floor((holdUntil - now) / 1000));

  // don't let a stray swipe close the app while money is moving
  useEffect(() => { tg.guardClose(view === 'paying'); return () => tg.guardClose(false); }, [view]);
  // after the first delivery, offer a home-screen shortcut (Mini Apps 2.0)
  useEffect(() => { if (view === 'done') tg.canAddToHome().then(setCanHome); }, [view]);

  // poll while paying
  useEffect(() => {
    if (view !== 'paying' || !order) return;
    const id = setInterval(async () => {
      try {
        const o = await api.order(order.id);
        setOrder(o);
        setLost(0);
        if (o.status === 'delivered') setView('done');
        else if (o.status === 'failed' || o.status === 'expired' || o.status === 'refunded' || o.status === 'underpaid') tg.notify('error');
      } catch { setLost((n) => n + 1); /* keep polling */ }
    }, 1500);
    return () => clearInterval(id);
  }, [view, order?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // the reveal: flip to the front, the pearl foil wipes across, sparks fly, then the codes arrive
  useEffect(() => {
    if (view !== 'done') return;
    setFlipped(true);
    setSettled(false);
    reveal.set(0);
    const t1 = setTimeout(() => { setFlipped(false); tg.tap('light'); }, 250);
    const t2 = setTimeout(() => {
      animate(reveal, 1, { duration: 1.4, ease: [0.65, 0, 0.35, 1] }).then(() => {
        tg.notify('success');
        setTimeout(() => setSettled(true), 250);
      });
    }, 1050);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [view, reveal]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1600);
    return () => clearTimeout(t);
  }, [toast]);

  function openReview() {
    if (!plan?.available) return;
    if (needsWallet && !bothMethods) { tonConnectUI.openModal(); return; }
    setAgree(false);
    setErr(null);
    setHoldUntil(Date.now() + 20 * 60 * 1000);
    setNow(Date.now());
    setSheet('review');
  }

  async function pay() {
    if (!plan || !config) return;
    setBusy(true);
    setErr(null);
    try {
      const o = await api.createOrder(config.region, plan.id, payWith, wallet || undefined);
      setOrder(o);
      setWalletSent(false);
      if (payWith === 'stars' && o.invoiceLink) {
        // Telegram's own checkout sheet; the code is issued once Telegram confirms the charge
        const st = await tg.openInvoice(o.invoiceLink);
        if (st !== 'paid' && st !== 'pending') throw new Error(st === 'cancelled' ? 'cancelled' : 'Telegram could not complete the payment. Nothing was charged.');
        tg.notify('success');
        setWalletSent(true);
        setSheet(null);
        setView('paying');
      } else if (payWith === 'stars') {
        // Demo mode: no bot, so pretend Telegram approved it
        setSheet(null);
        setView('paying');
        await new Promise((r) => setTimeout(r, 1100));
        setWalletSent(true);
        tg.tap('medium');
        await api.mockPay(o.id);
      } else if (config.paymentMode === 'chain' && o.merchant) {
        await tonConnectUI.sendTransaction({
          validUntil: Math.floor(o.expiresAt / 1000),
          network: o.network === 'testnet' ? CHAIN.TESTNET : CHAIN.MAINNET,
          messages: [{ address: o.merchant, amount: o.amountNano, payload: o.payload }],
        });
        setWalletSent(true);
        setSheet(null);
        setView('paying');
      } else {
        // Demo mode: simulate wallet approval and on-chain confirmation.
        setSheet(null);
        setView('paying');
        await new Promise((r) => setTimeout(r, 1400));
        setWalletSent(true);
        tg.tap('medium');
        await api.mockPay(o.id);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErr(/reject|cancel|declin/i.test(msg) ? (payWith === 'stars' ? 'Payment cancelled. Nothing was charged.' : 'Payment cancelled in your wallet. Nothing was charged.') : msg);
      tg.notify('error');
    } finally {
      setBusy(false);
    }
  }

  function copy(code: string) {
    navigator.clipboard?.writeText(code)
      .then(() => { setCopied(code); setToast('Code copied'); tg.notify('success'); setTimeout(() => setCopied(null), 1600); })
      .catch(() => setToast('Press and hold to copy'));
  }

  const loadHistory = useCallback(() => {
    setHistoryErr(null);
    api.orders().then(setHistory).catch((e) => setHistoryErr(e.message));
  }, []);
  function openOrders() {
    if (view === 'wallet') { toHome(); return; }
    if (view === 'paying') return; // stay on the payment until it settles
    tg.tap('light');
    setSheet(null);
    setView('wallet');
    loadHistory();
  }
  function openGuide(o: Order) { setGuideFor(o); setSheet('guide'); }

  const status = order?.status;
  const failed = status === 'failed' || status === 'expired' || status === 'refunded';
  const steps = useMemo(() => {
    const paid = status === 'paid' || status === 'fulfilling' || status === 'delivered';
    const stars = order?.method === 'stars';
    return [
      { label: stars ? (walletSent ? 'Paid with Stars' : 'Confirm in Telegram') : walletSent ? 'Approved in wallet' : 'Approve in your wallet', done: walletSent || status === 'underpaid', on: !walletSent && status !== 'underpaid' },
      { label: status === 'underpaid' ? 'Waiting for the rest of the payment' : paid ? 'Payment confirmed' : stars ? 'Confirming with Telegram' : order?.paymentSeen ? 'Payment seen, confirming' : 'Waiting for payment', done: paid, on: (walletSent || status === 'underpaid') && !paid },
      { label: 'Issuing your credit', done: status === 'delivered', on: paid && status !== 'delivered' },
    ];
  }, [status, walletSent, order?.paymentSeen, order?.method]);

  const backLine = failed ? (status === 'expired' ? 'Price expired' : status === 'refunded' ? 'Refunded' : 'Needs attention') : status === 'underpaid' ? 'Partly paid' : !walletSent ? (order?.method === 'stars' ? 'Waiting for Telegram' : 'Waiting for wallet') : status === 'paid' || status === 'fulfilling' ? 'Issuing credit' : 'Confirming payment';

  return (
    <>
      <div className="atmos" aria-hidden="true">
        <div className="beam" /><div className="beam" /><div className="beam" />
        <div className="floor" />
      </div>

      <AnimatePresence>{intro && <Onboarding key="ob" onDone={finishIntro} />}</AnimatePresence>

      {intro === false && <div className="app">
        <Header
          wallet={wallet}
          onCodes={openOrders}
          onHome={view === 'done' ? home : view === 'wallet' ? toHome : undefined}
          active={view === 'wallet'}
          onWallet={() => (wallet ? confirm('Disconnect wallet?') && tonConnectUI.disconnect() : tonConnectUI.openModal())}
        />

        <AnimatePresence mode="wait">
          {view === 'home' && (
            <motion.main key="home" className="home" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="intro" {...rise(0.2)}><h1>Choose your Claude plan</h1></motion.div>

              {plans ? (
                <PlanCarousel plans={plans} index={index} onIndex={setIndex} onPull={openReview} disabled={!plan?.available} />
              ) : bootErr ? (
                <motion.div className="carousel boot-err" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="card-ghost still" />
                  <div className="boot-msg">
                    <b>{online ? "Couldn't load plans" : "You're offline"}</b>
                    <span>{online ? 'Check your connection and try again.' : 'Plans load as soon as you reconnect.'}</span>
                    {online && <button className="btn btn-quiet" onClick={load}>Try again</button>}
                  </div>
                </motion.div>
              ) : (
                <div className="carousel"><div className="card-ghost" /></div>
              )}

              <motion.div className="price" aria-live="polite" {...rise(0.75)}>
                {plan?.available ? (
                  <>
                    <div className="gram">
                      <Rolling text={payWith === 'stars' ? plan.stars!.toLocaleString() : fmtGram(plan.gram!)} dir={rollDir} />
                      {payWith === 'stars' ? <StarIcon size={28} /> : <GramIcon size={28} />}
                    </div>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.div key={plan.id + payWith} className="meta" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }}>
                        ≈ ${plan.usd!.toFixed(2)} · Claude {plan.name}, 1 month
                        {bothMethods && (
                          <button className="alt-price" onClick={() => chooseMethod(payWith === 'stars' ? 'gram' : 'stars')} aria-label="Switch currency">
                            or <span className="amt"><Amount method={payWith === 'stars' ? 'gram' : 'stars'} gram={plan.gram} stars={plan.stars} size={13} /></span>
                          </button>
                        )}
                      </motion.div>
                    </AnimatePresence>
                  </>
                ) : plan ? (
                  <div className="meta" style={{ paddingTop: 12 }}>{pricesUpdating ? 'Prices are updating. Try again in a minute.' : "This plan isn't available right now"}</div>
                ) : null}
                {plans && (
                  <div className="dots">{plans.map((p, i) => <motion.i key={p.id} layout className={i === index ? 'on' : ''} />)}</div>
                )}
              </motion.div>
              {err && <p className="error" style={{ textAlign: 'center' }}>{err}</p>}

              {plans && <motion.div className="pullhint" {...rise(0.95)}>
                <div className="chev" aria-hidden="true"><span /><span /></div>
                <span>{needsWallet ? 'Pull the card down to connect your wallet' : 'Pull the card down to buy'}</span>
                <button onClick={openReview} disabled={!plan?.available}>or tap here</button>
              </motion.div>}
            </motion.main>
          )}

          {view === 'paying' && order && (
            <motion.main key="paying" className="center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="pay-stage" initial={{ y: 160, scale: 0.8, rotate: -6 }} animate={{ y: 0, scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 140, damping: 18 }}>
                <HoloCard
                  planId={order.plan.id}
                  credit={fmtMoney(order.credit, order.currency)}
                  flipped
                  idle
                  back={
                    <>
                      <b>{backLine}</b>
                      <span className="amt"><Amount method={order.method} gram={order.gram} stars={order.stars} size={13} /></span>
                      {!failed && <div className="charge"><i /></div>}
                    </>
                  }
                />
              </motion.div>
              {failed ? (
                <>
                  <motion.p className="done-title" style={{ color: 'var(--mute)', maxWidth: 320, fontSize: 14.5 }} {...rise(0.1)}>
                    {order.error ?? 'No payment arrived in time. If you already paid, it is still picked up within 2 hours and shows in your codes.'}
                  </motion.p>
                  <motion.div className="actions" {...rise(0.2)}><button className="btn btn-quiet" onClick={home}>Back to plans</button></motion.div>
                </>
              ) : (
                <>
                  <ul className="status" aria-live="polite">
                    {steps.map((s, i) => (
                      <motion.li key={i} className={s.done ? 'done' : s.on ? 'on' : ''} {...rise(0.3 + i * 0.1)}>
                        <span className="ic">
                          <AnimatePresence mode="wait" initial={false}>
                            {s.done ? (
                              <motion.span key="ok" className="ok" initial={{ scale: 0, rotate: -90 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }} />
                            ) : s.on ? (
                              <motion.span key="ring" className="ring" exit={{ scale: 0 }} />
                            ) : (
                              <span key="wait" className="wait" />
                            )}
                          </AnimatePresence>
                        </span>
                        {s.label}
                      </motion.li>
                    ))}
                  </ul>
                  {order.method !== 'stars' && <motion.div className="memo" {...rise(0.65)}>
                    <AnimatePresence mode="wait" initial={false}>
                      <motion.span key={lost >= 3 ? 'r' : 'm'} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        {lost >= 3 ? 'Reconnecting… your payment is safe' : `memo ${order.comment}`}
                      </motion.span>
                    </AnimatePresence>
                  </motion.div>}
                  {order.method === 'stars' && lost >= 3 && <motion.div className="memo" {...rise(0)}>Reconnecting… your payment is safe</motion.div>}
                  {status === 'underpaid' && order.error && <p className="memo" style={{ color: 'var(--danger)', fontFamily: 'var(--font)', maxWidth: 300, textAlign: 'center' }}>{order.error}</p>}
                </>
              )}
            </motion.main>
          )}

          {view === 'done' && order?.codes && (
            <motion.main key="done" className="center" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="reveal-stage">
                <motion.div animate={settled ? { y: 0, scale: 1 } : { y: 30, scale: 1.06 }} transition={{ type: 'spring', stiffness: 120, damping: 18 }}>
                  <HoloCard
                    className="md"
                    planId={order.plan.id}
                    credit={fmtMoney(order.credit, order.currency)}
                    reveal={reveal}
                    flipped={flipped}
                    interactive
                    back={<><b>Ready</b><span className="amt"><Amount method={order.method} gram={order.gram} stars={order.stars} size={13} /></span></>}
                  />
                </motion.div>
              </div>
              {settled && (
                <div style={{ width: '100%' }}>
                  <motion.div className="done-title" {...rise(0)}>
                    <h1>Your credit is ready</h1>
                    <p>{fmtMoney(order.credit, order.currency)} for Claude {PLAN_LABEL[order.plan.id]}</p>
                  </motion.div>
                  <div className="codes">
                    {order.codes.map((c, i) => (
                      <motion.button key={c.code} className={`code ${copied === c.code ? 'is-copied' : ''}`} onClick={() => copy(c.code)} aria-label={`Copy code ${c.code}`} whileTap={{ scale: 0.98 }} {...rise(0.1 + i * 0.08)}>
                        {groupCode(c.code)}
                        {order.codes!.length > 1 && <span className="amt-sm">{fmtMoney(c.value, order.currency)}</span>}
                        <span className="copy">{copied === c.code ? 'Copied' : 'Copy'}</span>
                      </motion.button>
                    ))}
                  </div>
                  <div className="actions">
                    <motion.button className="btn btn-pearl" onClick={() => { tg.tap('medium'); tg.openLink(`https://apps.apple.com/redeem?code=${order.codes![0].code}`); }} whileTap={{ scale: 0.97 }} {...rise(0.3)}>
                      Redeem in App Store
                    </motion.button>
                    <motion.button className="btn btn-quiet" onClick={() => openGuide(order)} whileTap={{ scale: 0.97 }} {...rise(0.38)}>
                      How to activate Claude {PLAN_LABEL[order.plan.id]}
                    </motion.button>
                    {canHome && (
                      <button className="link-btn add-home" onClick={() => { tg.addToHome(); setCanHome(false); }}>
                        Add Tessera to your home screen
                      </button>
                    )}
                  </div>
                </div>
              )}
            </motion.main>
          )}

          {view === 'wallet' && (
            <motion.main key="wallet" className="wallet-view" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <motion.div className="intro" {...rise(0.05)}><h1>Your codes</h1></motion.div>
              <Wallet
                orders={history}
                error={historyErr}
                copied={copied}
                onCopy={copy}
                onRetry={loadHistory}
                onShop={toHome}
                onGuide={openGuide}
                onBack={toHome}
              />
            </motion.main>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {!online && (
            <motion.div className="netbar" role="status" initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
              <i /> No connection
            </motion.div>
          )}
        </AnimatePresence>
      </div>}

      <Sheet open={sheet === 'review'} onClose={closeSheet} label="Review payment">
        {plan?.available && (
          <div className="st">
            <div className="summary">
              <motion.div initial={{ rotate: -14, y: 30, opacity: 0 }} animate={{ rotate: -6, y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 200, damping: 16, delay: 0.1 }}>
                <HoloCard className="sm" planId={plan.id} credit={fmtMoney(plan.credit!, plan.currency!)} idle />
              </motion.div>
              <div className="what">
                <b>Claude {plan.name}</b>
                1 month · delivered instantly
              </div>
            </div>
            <dl className="rows">
              <div className="row"><dt>App Store credit</dt><dd>{fmtMoney(plan.credit!, plan.currency!)}{plan.codes! > 1 ? ` · ${plan.codes} codes` : ''}</dd></div>
              <div className="row"><dt>In-app price</dt><dd>{fmtMoney(plan.appPrice!, plan.currency!)}</dd></div>
              <div className="row total"><dt>You pay</dt><dd className="amt"><Amount method={payWith} gram={plan.gram} stars={plan.stars} size={17} /></dd></div>
            </dl>
            {bothMethods && (
              <div className="paywith" role="radiogroup" aria-label="Pay with">
                {(['gram', 'stars'] as const).map((m) => (
                  <button key={m} type="button" role="radio" aria-checked={payWith === m} className={payWith === m ? 'on' : ''} onClick={() => chooseMethod(m)}>
                    {payWith === m && <motion.i layoutId="pw" className="pw-bg" transition={{ type: 'spring', stiffness: 520, damping: 38 }} />}
                    <span className="pw-amt"><Amount method={m} gram={plan.gram} stars={plan.stars} size={15} /></span>
                    <span className="pw-sub">{m === 'gram' ? (wallet || config?.paymentMode === 'mock' ? 'Wallet' : 'Connect wallet') : 'Telegram Stars'}</span>
                  </button>
                ))}
              </div>
            )}
            <label className="agree">
              <input type="checkbox" checked={agree} onChange={(e) => { tg.select(); setAgree(e.target.checked); }} />
              <span>I understand App Store credit can't be refunded once issued.</span>
            </label>
            {err && <p className="error" role="alert">{err}</p>}
            {needsWallet ? (
              <motion.button className="btn btn-pearl" onClick={() => tonConnectUI.openModal()} whileTap={{ scale: 0.97 }}>Connect wallet</motion.button>
            ) : (
              <motion.button className="btn btn-pearl" disabled={!agree || busy} onClick={pay} whileTap={{ scale: 0.97 }}>
                {busy ? <span className="spin" /> : <>Pay<span className="amt"><Amount method={payWith} gram={plan.gram} stars={plan.stars} size={19} /></span></>}
              </motion.button>
            )}
            <p className="fine">
              Price held for {Math.floor(left / 60)}:{String(left % 60).padStart(2, '0')}
              {config?.paymentMode === 'mock' ? ` · Demo mode, ${payWith === 'stars' ? 'no Stars are charged' : 'nothing leaves your wallet'}` : ''}
            </p>
          </div>
        )}
      </Sheet>

      <Sheet open={sheet === 'guide'} onClose={closeSheet} label="How to activate">
        <div className="st">
          <h2>Activate Claude {guideFor && PLAN_LABEL[guideFor.plan.id]}</h2>
          <p className="sub">Four steps, about two minutes.</p>
          {guideFor && <Guide order={guideFor} />}
          <button className="btn btn-quiet" style={{ marginTop: 18 }} onClick={view === 'wallet' ? closeSheet : home}>Done</button>
        </div>
      </Sheet>

      <AnimatePresence>
        {toast && (
          <motion.div className="toast" initial={{ opacity: 0, y: -16, scale: 0.9 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
            {toast}
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
