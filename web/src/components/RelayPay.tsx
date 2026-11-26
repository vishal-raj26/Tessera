// Paying with another coin through Relay. The review sheet's picker (coin, then network), and the card on
// the payment screen: how much to send, the one-time address with its QR code, and which network.
import { motion } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import type { CoinRoute, Order } from '../api';
import { trimAmt } from '../amount';

export { trimAmt };

/** Coin first (USDT, USDC, ETH, SOL, BTC), then the network it's on. */
export function CoinPicker({ coins, value, onChange }: { coins: CoinRoute[]; value: string | null; onChange: (key: string) => void }) {
  const list = [...new Set(coins.map((c) => c.coin))];
  const picked = coins.find((c) => c.key === value) ?? null;
  const coin = picked?.coin ?? null;
  const nets = coin ? coins.filter((c) => c.coin === coin) : [];
  return (
    <div className="coin-pick">
      <div className="chips" role="radiogroup" aria-label="Coin">
        {list.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={coin === c} className={coin === c ? 'on' : ''}
            onClick={() => onChange(coins.find((x) => x.coin === c)!.key)}>{c}</button>
        ))}
      </div>
      {nets.length > 1 && (
        <motion.div className="chips nets" role="radiogroup" aria-label="Network" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
          {nets.map((n) => (
            <button key={n.key} type="button" role="radio" aria-checked={value === n.key} className={value === n.key ? 'on' : ''} onClick={() => onChange(n.key)}>{n.network}</button>
          ))}
        </motion.div>
      )}
      <p className="coin-note">{picked ? `You send ${picked.coin} on ${picked.network}. Relay swaps it to GRAM for us.` : 'Pick the coin you want to pay with.'}</p>
    </div>
  );
}

/** What to send and where: amount, network, address and QR code (or, in test mode, a simulate button). */
export function RelayPay({ order, onCopy, onSimulate }: { order: Order; onCopy: (text: string, what: string) => void; onSimulate: () => void }) {
  const r = order.relay!;
  const amt = r.amount ? trimAmt(r.amount, r.coin) : null;
  return (
    <motion.div className="relay-card" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.4 }}>
      <div className="relay-row">
        <span className="relay-label">Amount</span>
        <button className="relay-val" onClick={() => amt && onCopy(amt, 'Amount')} disabled={!amt}>
          <b>{amt ?? '…'} {r.coin}</b>{amt && <CopyIcon />}
        </button>
      </div>
      <div className="relay-row">
        <span className="relay-label">Network</span>
        <span className="relay-val"><b>{r.network}</b></span>
      </div>
      {r.address ? (
        <>
          <div className="relay-qr"><QRCodeSVG value={r.address} size={128} bgColor="#f5f3ef" fgColor="#0a0a0a" marginSize={2} /></div>
          <button className="relay-addr" onClick={() => onCopy(r.address!, 'Address')}>
            <span>{r.address}</span><CopyIcon />
          </button>
          <p className="relay-warn">Send only {r.coin} on {r.network}, in one payment. Anything else can be lost.</p>
        </>
      ) : r.test ? (
        <>
          <p className="relay-warn">Test mode: there's no real address, so don't send anything.</p>
          <button className="btn btn-quiet relay-sim" onClick={onSimulate}>Simulate payment</button>
        </>
      ) : null}
    </motion.div>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
      <rect x="8" y="8" width="12" height="12" rx="2.5" /><path d="M16 8V6.5A2.5 2.5 0 0 0 13.5 4h-7A2.5 2.5 0 0 0 4 6.5v7A2.5 2.5 0 0 0 6.5 16H8" />
    </svg>
  );
}
