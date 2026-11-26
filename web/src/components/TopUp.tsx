// Add GRAM from another chain. Telegram lets bots take only GRAM for this, so Tessera never accepts other
// coins: the buyer gets their own Relay address for a coin they hold, whatever they send there arrives as
// GRAM in *their* TON wallet, and they pay for the plan in GRAM as usual.
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { api, fmtGram, type CoinRoute, type TopUp as TopUpAddr } from '../api';
import { trimAmt } from '../amount';
import { GramIcon } from './GramIcon';
import { tg } from '../tg';


interface Props {
  coins: CoinRoute[];
  /** logos: each coin's (by symbol) and each network's (by chain id) */
  icons?: Record<string, string>;
  chainIcons?: Record<string, string>;
  /** the buyer's connected TON wallet ('' when none) */
  wallet: string;
  /** GRAM still missing for the purchase they came from (0: just topping up) */
  needGram: number;
  onConnect: () => void;
  /** back to the checkout (after a top-up, or to leave) */
  onBack?: () => void;
  onToast: (s: string) => void;
}

export function TopUp({ coins, icons = {}, chainIcons = {}, wallet, needGram, onConnect, onBack, onToast }: Props) {
  // nothing chosen when the sheet opens: first a coin, then (if it's on more than one) its network
  const [coin, setCoin] = useState<string | null>(null);
  const [route, setRoute] = useState<string | null>(null);
  const picked = coins.find((c) => c.key === route) ?? null;
  const [addr, setAddr] = useState<TopUpAddr | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [state, setState] = useState<'waiting' | 'seen' | 'success' | 'refunded' | 'failed'>('waiting');
  const since = useRef(Date.now());

  // the address for the chosen coin (kept on the server, so it's the same one every time)
  useEffect(() => {
    if (!picked || !wallet) return;
    let alive = true;
    setAddr(null); setErr(null); setState('waiting');
    const needNano = needGram > 0 ? String(Math.ceil(needGram * 1e9)) : undefined;
    api.topUp(picked.key, wallet, needNano).then((a) => { if (alive) setAddr(a); }).catch((e) => { if (alive) setErr(e.message); });
    return () => { alive = false; };
  }, [picked?.key, wallet]); // eslint-disable-line react-hooks/exhaustive-deps

  // how the deposit is going: every 5 seconds while the sheet is open, until it lands
  useEffect(() => {
    if (!addr || state === 'success' || state === 'refunded' || state === 'failed') return;
    const id = setInterval(() => {
      api.topUpStatus(addr.address, addr.route, since.current).then((s) => {
        if (s.state === 'seen' || s.state === 'success' || s.state === 'refunded' || s.state === 'failed') {
          if (s.state !== state) { setState(s.state); tg.notify(s.state === 'success' ? 'success' : s.state === 'seen' ? 'warning' : 'error'); }
        }
      }).catch(() => {});
    }, 5000);
    return () => clearInterval(id);
  }, [addr, state]);

  // tap a coin: its only network is taken at once; with several, they appear to pick from. Tap it again to unpick.
  const pickCoin = (c: string) => {
    tg.select();
    if (c === coin) { setCoin(null); setRoute(null); setAddr(null); setErr(null); return; }
    const on = coins.filter((x) => x.coin === c);
    setCoin(c); setAddr(null); setErr(null);
    setRoute(on.length === 1 ? on[0].key : null);
  };
  const pickNet = (k: string) => { tg.select(); setRoute(k); };
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => { onToast(`${what} copied`); tg.notify('success'); }).catch(() => onToast('Press and hold to copy'));
  const list = [...new Set(coins.map((c) => c.coin))];
  const nets = coin ? coins.filter((c) => c.coin === coin) : [];

  return (
    <div className="st topup">
      <div className="tu-head">
        <h2>Add GRAM</h2>
        <p className="sub">
          {wallet
            ? 'Send any of these coins. It arrives as GRAM in your wallet.'
            : 'Connect your TON wallet first: that’s where your GRAM arrives.'}
        </p>
        {needGram > 0 && wallet && (
          <p className="topup-need">You need <b>{fmtGram(needGram)}</b><GramIcon size={13} /> more for this plan</p>
        )}
      </div>

      {!wallet ? (
        <motion.button className="btn btn-pearl" onClick={onConnect} whileTap={{ scale: 0.97 }}>Connect wallet</motion.button>
      ) : (
        <>
          {/* one panel, three connected steps: coin, then its network (if it has several), then where to send */}
          <motion.div className="tu-flow" layout transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}>
            <Step n={1} label="Coin" done={!!coin}>
              <div className={`tu-grid coins ${coin ? 'has-pick' : ''}`} role="radiogroup" aria-label="Coin">
                {list.map((c) => (
                  <button key={c} type="button" role="radio" aria-checked={coin === c} className={coin === c ? 'on' : ''} onClick={() => pickCoin(c)}>
                    <Logo src={icons[c]} label={c} big />
                    <span>{c}</span>
                  </button>
                ))}
              </div>
            </Step>

            <AnimatePresence initial={false}>
              {nets.length > 1 && (
                <Step key={`net-${coin}`} n={2} label="Network" done={!!picked} reveal>
                  <div className="tu-grid nets" role="radiogroup" aria-label="Network">
                    {nets.map((n) => (
                      <button key={n.key} type="button" role="radio" aria-checked={route === n.key} className={route === n.key ? 'on' : ''} onClick={() => pickNet(n.key)}>
                        <Logo src={n.chainId != null ? chainIcons[n.chainId] : undefined} label={n.network} />
                        <span>{n.network}</span>
                      </button>
                    ))}
                  </div>
                </Step>
              )}
            </AnimatePresence>

            <AnimatePresence initial={false}>
              {picked && (
                <Step key={`send-${picked.key}`} n={nets.length > 1 ? 3 : 2} label={state === 'waiting' ? 'Send' : 'Status'} done={state === 'success'} reveal>
                  {err ? <p className="error tu-err" role="alert">{err}</p>
                    : !addr ? <div className="tu-loading"><span className="spin" /></div>
                    : state === 'waiting' ? (
                      addr.address ? (
                        <div className="tu-send">
                          <div className="tu-send-row">
                            <div className="relay-qr"><QRCodeSVG value={addr.address} size={104} bgColor="#f5f3ef" fgColor="#0a0a0a" marginSize={2} /></div>
                            <div className="tu-send-info">
                              <small>Your {addr.coin} address on {addr.network}</small>
                              <button className="tu-addr" onClick={() => copy(addr.address!, 'Address')}><span>{addr.address}</span><CopyIcon /></button>
                            </div>
                          </div>
                          {addr.need?.amount && (
                            <button className="tu-need" onClick={() => copy(trimAmt(addr.need!.amount, addr.coin), 'Amount')}>
                              <span>Send at least</span><b>{trimAmt(addr.need.amount, addr.coin)} {addr.coin}</b><CopyIcon />
                            </button>
                          )}
                          <p className="tu-fine">Only {addr.coin} on {addr.network}. About 1% fee. Reusable.</p>
                        </div>
                      ) : (
                        <div className="tu-send">
                          {addr.need?.amount && <div className="tu-need"><span>For this plan</span><b>{trimAmt(addr.need.amount, addr.coin)} {addr.coin}</b></div>}
                          <p className="tu-fine">Test mode: there’s no real address, so don’t send anything.</p>
                          <button className="btn btn-quiet" onClick={() => { tg.tap('medium'); api.topUpSim(addr.route).catch(() => {}); }}>Simulate a deposit</button>
                        </div>
                      )
                    ) : (
                      <div className="topup-state">
                        <span className={`topup-dot ${state}`} />
                        <b>{state === 'seen' ? 'Deposit received, swapping to GRAM…' : state === 'success' ? 'GRAM sent to your wallet' : state === 'refunded' ? 'Relay sent your deposit back' : 'This deposit needs a look'}</b>
                        <span>{state === 'seen' ? 'Usually under a minute.' : state === 'success' ? (addr.test ? 'Test mode: nothing really moved.' : 'Your balance updates in a moment.') : state === 'refunded' ? 'It couldn’t be swapped, so it went back to where it came from.' : 'Contact support from the bot and we’ll sort it out.'}</span>
                      </div>
                    )}
                </Step>
              )}
            </AnimatePresence>
          </motion.div>
        </>
      )}

      {onBack && (
        <button className={`btn ${state === 'success' ? 'btn-pearl' : 'btn-quiet'}`} onClick={onBack}>{state === 'success' ? 'Back to checkout' : 'Back'}</button>
      )}
    </div>
  );
}

/** one step of the flow: a numbered header (with what you chose) over its content; later steps slide open */
function Step({ n, label, done, reveal, children }: { n: number; label: string; done: boolean; reveal?: boolean; children: ReactNode }) {
  const body = (
    <>
      <header className="tu-sec-head">
        <i className={done ? 'done' : ''}>{done ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg> : n}</i>
        <span>{label}</span>
      </header>
      {children}
    </>
  );
  return reveal
    ? <motion.section className="tu-sec" initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}><div className="tu-sec-in">{body}</div></motion.section>
    : <section className="tu-sec"><div className="tu-sec-in">{body}</div></section>;
}

/** a coin's or network's logo in a chip (its first letter when there's no logo) */
function Logo({ src, label, big }: { src?: string; label: string; big?: boolean }) {
  return <span className={`chip-logo ${big ? 'big' : ''}`} aria-hidden="true">{src ? <img src={src} alt="" loading="lazy" /> : label.slice(0, 1)}</span>;
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  );
}
