import { motion } from 'framer-motion';
import { Emblem } from './Emblem';
import { GramIcon } from './GramIcon';

interface Props {
  wallet: string;
  onWallet: () => void;
  onCodes: () => void;
  onHome?: () => void;
  active?: boolean; // the codes view is open
  /** codes bought but not yet redeemed: a badge on the codes button */
  codesCount?: number;
  /** the connected wallet's GRAM balance, when known */
  balance?: number | null;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** No bar: the wordmark on the left; your codes and your GRAM balance (or Connect) on the right. */
export function Header({ wallet, onWallet, onCodes, onHome, active, codesCount = 0, balance }: Props) {
  return (
    <motion.header
      className="hb"
      initial={{ y: -12, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
    >
      <button className="hb-word" onClick={onHome} aria-label="Tessera">
        <Emblem size={22} stroke={1.8} assemble />
        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5, duration: 0.4 }}>
          Tessera
        </motion.span>
      </button>

      <div className="hb-right">
        <motion.button
          className={`hb-round ${active ? 'is-on' : ''}`}
          onClick={onCodes}
          aria-label={active ? 'Back to plans' : `Your codes${codesCount ? `, ${codesCount} to redeem` : ''}`}
          aria-pressed={active}
          whileTap={{ scale: 0.9 }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
            <rect x="3" y="7" width="13" height="14" rx="2.5" />
            <path d="M7.5 4.5h9a3 3 0 0 1 3 3v10" />
          </svg>
          {codesCount > 0 && <span className="hb-badge" aria-hidden="true">{codesCount > 99 ? '99+' : codesCount}</span>}
        </motion.button>

        <motion.button
          className={`hb-pill ${wallet ? 'on' : ''}`}
          onClick={onWallet}
          whileTap={{ scale: 0.95 }}
          layout
          aria-label={wallet ? (balance != null ? `Wallet balance ${fmt(balance)} GRAM` : `Wallet ${short(wallet)}`) : 'Connect wallet'}
        >
          {wallet ? (
            balance != null
              ? <><b>{fmt(balance)}</b><GramIcon size={15} /></>
              : <span className="hb-addr">{short(wallet)}</span>
          ) : (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
                <rect x="3" y="6" width="18" height="13" rx="3" />
                <path d="M16 12.5h2M3 9h15a3 3 0 0 0-3-3H6" />
              </svg>
              Connect
            </>
          )}
        </motion.button>
      </div>
    </motion.header>
  );
}
