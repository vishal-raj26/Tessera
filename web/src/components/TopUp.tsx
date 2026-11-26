// Add GRAM from another chain. Telegram lets bots take only Stars or GRAM, so Tessera never accepts other
// coins: the buyer gets their own Relay address for a coin they hold, whatever they send there arrives as
// GRAM in *their* TON wallet, and they pay for the plan in GRAM as usual.
import { AnimatePresence, motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { useEffect, useRef, useState } from 'react';
import { api, fmtGram, type CoinRoute, type TopUp as TopUpAddr } from '../api';
import { trimAmt } from '../amount';
import { GramIcon } from './GramIcon';
import { tg } from '../tg';

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

interface Props {
  coins: CoinRoute[];
  /** the buyer's connected TON wallet ('' when none) */
  wallet: string;
  /** GRAM still missing for the purchase they came from (0: just topping up) */
  needGram: number;
  onConnect: () => void;
  /** back to the checkout (after a top-up, or to leave) */
  onBack?: () => void;
  onToast: (s: string) => void;
}

export function TopUp({ coins, wallet, needGram, onConnect, onBack, onToast }: Props) {
  const [route, setRoute] = useState<string | null>(() => { try { return localStorage.getItem('coin'); } catch { return null; } });
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

  const pick = (k: string) => { tg.select(); setRoute(k); try { localStorage.setItem('coin', k); } catch { /* ignore */ } };
  const copy = (t: string, what: string) => navigator.clipboard?.writeText(t).then(() => { onToast(`${what} copied`); tg.notify('success'); }).catch(() => onToast('Press and hold to copy'));
  const list = [...new Set(coins.map((c) => c.coin))];
  const nets = picked ? coins.filter((c) => c.coin === picked.coin) : [];

  return (
    <div className="st topup">
      <h2>Add GRAM</h2>
      <p className="sub">
        {wallet
          ? <>Send a coin from any wallet or exchange. It arrives as GRAM in your wallet <b>{short(wallet)}</b>.</>
          : 'Connect your TON wallet first: that’s where your GRAM arrives.'}
      </p>
      {needGram > 0 && wallet && (
        <p className="topup-need">You need <b>{fmtGram(needGram)}</b><GramIcon size={13} /> more for this plan.</p>
      )}

      {!wallet ? (
        <motion.button className="btn btn-pearl" onClick={onConnect} whileTap={{ scale: 0.97 }}>Connect wallet</motion.button>
      ) : (
        <>
          <div className="coin-pick">
            <div className="chips" role="radiogroup" aria-label="Coin">
              {list.map((c) => (
                <button key={c} type="button" role="radio" aria-checked={picked?.coin === c} className={picked?.coin === c ? 'on' : ''}
                  onClick={() => pick(coins.find((x) => x.coin === c)!.key)}>{c}</button>
              ))}
            </div>
            {nets.length > 1 && (
              <div className="chips nets" role="radiogroup" aria-label="Network">
                {nets.map((n) => (
                  <button key={n.key} type="button" role="radio" aria-checked={route === n.key} className={route === n.key ? 'on' : ''} onClick={() => pick(n.key)}>{n.network}</button>
                ))}
              </div>
            )}
          </div>

          {err && <p className="error" role="alert">{err}</p>}
          {picked && !addr && !err && <div className="topup-card loading"><span className="spin" /></div>}
          <AnimatePresence mode="wait">
            {picked && addr && (
              <motion.div key={addr.route} className="topup-card" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                {state === 'waiting' ? (
                  addr.address ? (
                    <>
                      <div className="relay-qr"><QRCodeSVG value={addr.address} size={124} bgColor="#f5f3ef" fgColor="#0a0a0a" marginSize={2} /></div>
                      <button className="relay-addr" onClick={() => copy(addr.address!, 'Address')}><span>{addr.address}</span><CopyIcon /></button>
                      {addr.need?.amount && (
                        <button className="topup-est" onClick={() => copy(trimAmt(addr.need!.amount, addr.coin), 'Amount')}>
                          For this plan, send at least <b>{trimAmt(addr.need.amount, addr.coin)} {addr.coin}</b><CopyIcon />
                        </button>
                      )}
                      <p className="relay-warn">Only {addr.coin} on {addr.network}. Any amount; Relay’s fee is about 1%. This address is yours to reuse.</p>
                    </>
                  ) : (
                    <>
                      {addr.need?.amount && <p className="topup-est">For this plan: about <b>{trimAmt(addr.need.amount, addr.coin)} {addr.coin}</b></p>}
                      <p className="relay-warn">Test mode: there’s no real address, so don’t send anything.</p>
                      <button className="btn btn-quiet" onClick={() => { tg.tap('medium'); api.topUpSim(addr.route).catch(() => {}); }}>Simulate a deposit</button>
                    </>
                  )
                ) : (
                  <div className="topup-state">
                    <span className={`topup-dot ${state}`} />
                    <b>{state === 'seen' ? 'Deposit received, swapping to GRAM…' : state === 'success' ? 'GRAM sent to your wallet' : state === 'refunded' ? 'Relay sent your deposit back' : 'This deposit needs a look'}</b>
                    <span>{state === 'seen' ? 'Usually under a minute.' : state === 'success' ? (addr.test ? 'Test mode: nothing really moved.' : 'Your balance updates in a moment.') : state === 'refunded' ? 'It couldn’t be swapped, so it went back to where it came from.' : 'Contact support from the bot and we’ll sort it out.'}</span>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </>
      )}

      {onBack && (
        <button className={`btn ${state === 'success' ? 'btn-pearl' : 'btn-quiet'}`} onClick={onBack}>{state === 'success' ? 'Back to checkout' : 'Back'}</button>
      )}
    </div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  );
}
