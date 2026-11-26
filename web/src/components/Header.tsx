import { motion } from 'framer-motion';
import { GramIcon } from './GramIcon';

interface Props {
  wallet: string;
  /** the Tessera logo opens the menu (codes, top up, how it works, help, wallet) */
  onMenu: () => void;
  onConnect: () => void;
  onCodes: () => void;
  /** the + next to the balance: top up GRAM from another chain */
  onTopUp?: () => void;
  active?: boolean; // the codes view is open
  /** codes bought but not yet redeemed: a count on the codes button */
  codesCount?: number;
  /** the connected wallet's GRAM balance, when known */
  balance?: number | null;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The top bar. Left: the Tessera logo, which opens the menu. Right, in one capsule: your codes (with how
 *  many wait to be redeemed) and your wallet: its balance with a + to top up, or Connect wallet. */
export function Header({ wallet, onMenu, onConnect, onCodes, onTopUp, active, codesCount = 0, balance }: Props) {
  return (
    <motion.header className="bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <button className="bar-logo" onClick={onMenu} aria-label="Menu" aria-haspopup="dialog">
        <span className="bar-mark" aria-hidden="true"><b /><b /><b /><b /></span>
        <span>Tessera</span>
      </button>

      <div className="bar-pill">
        <button className={`bar-codes ${active ? 'is-on' : ''}`} onClick={onCodes} aria-pressed={active}
          aria-label={active ? 'Back to plans' : `Your codes${codesCount ? `, ${codesCount} to redeem` : ''}`}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
            <path d="M3.5 7.5A1.5 1.5 0 0 1 5 6h14a1.5 1.5 0 0 1 1.5 1.5V10a2 2 0 0 0 0 4v2.5A1.5 1.5 0 0 1 19 18H5a1.5 1.5 0 0 1-1.5-1.5V14a2 2 0 0 0 0-4Z" />
            <path d="M14.5 6.5v11" strokeDasharray="1.6 2" />
          </svg>
          {codesCount > 0 && <i className="bar-badge">{codesCount > 99 ? '99+' : codesCount}</i>}
        </button>
        {wallet ? (
          <span className="bar-wallet">
            <span className="bar-bal" aria-label={balance != null ? `Balance ${fmt(balance)} GRAM` : `Wallet ${short(wallet)}`}>
              {balance != null ? <><b>{fmt(balance)}</b><GramIcon size={15} /></> : <span className="bar-addr">{short(wallet)}</span>}
            </span>
            {onTopUp && (
              <button className="bar-plus" onClick={onTopUp} aria-label="Top up GRAM">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            )}
          </span>
        ) : (
          <button className="bar-connect" onClick={onConnect}>Connect wallet</button>
        )}
      </div>
    </motion.header>
  );
}
