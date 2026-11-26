import { motion } from 'framer-motion';
import { Emblem } from './Emblem';
import { GramIcon } from './GramIcon';

interface Props {
  wallet: string;
  onWallet: () => void;
  onCodes: () => void;
  onHome?: () => void;
  active?: boolean; // the codes view is open
  /** codes bought but not yet redeemed: a count next to the codes button */
  codesCount?: number;
  /** the connected wallet's GRAM balance, when known */
  balance?: number | null;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The navigation bar: plain, no boxes. The wordmark on the left; your codes (with how many are
 *  waiting to be redeemed) and your balance (or Connect wallet) on the right, as text buttons. */
export function Header({ wallet, onWallet, onCodes, onHome, active, codesCount = 0, balance }: Props) {
  return (
    <motion.header className="nav" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <button className="nav-brand" onClick={onHome} aria-label="Tessera">
        <Emblem size={18} stroke={1.9} assemble />
        <span>Tessera</span>
      </button>

      <div className="nav-right">
        <button
          className={`nav-btn ${active ? 'is-on' : ''}`}
          onClick={onCodes}
          aria-label={active ? 'Back to plans' : `Your codes${codesCount ? `, ${codesCount} to redeem` : ''}`}
          aria-pressed={active}
        >
          <span>Codes</span>
          {codesCount > 0 && <span className="nav-count" aria-hidden="true">{codesCount > 99 ? '99+' : codesCount}</span>}
        </button>

        <span className="nav-sep" aria-hidden="true" />

        <button
          className={`nav-btn nav-wallet ${wallet ? 'is-on' : ''}`}
          onClick={onWallet}
          aria-label={wallet ? (balance != null ? `Wallet balance ${fmt(balance)} GRAM` : `Wallet ${short(wallet)}`) : 'Connect wallet'}
        >
          {wallet ? (
            balance != null
              ? <><b>{fmt(balance)}</b><GramIcon size={14} /></>
              : <span className="nav-addr">{short(wallet)}</span>
          ) : 'Connect wallet'}
        </button>
      </div>
    </motion.header>
  );
}
