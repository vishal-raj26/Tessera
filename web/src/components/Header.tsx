import { AnimatePresence, motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { GramIcon } from './GramIcon';

interface Props {
  wallet: string;
  /** the Tessera logo: back to the home screen */
  onHome: () => void;
  onConnect: () => void;
  /** the wallet (balance or address): its popup (name, address, top up, disconnect) */
  onWallet: () => void;
  /** the + next to the balance: top up GRAM from another chain */
  onTopUp?: () => void;
  /** the buyer's store country, and changing it */
  region: { code: string; flag: string } | null;
  onRegion: () => void;
  /** the connected wallet's GRAM balance, when known */
  balance?: number | null;
  /** a small popover dropping from the bar (the country list or the wallet), and closing it */
  pop?: { key: string; content: ReactNode } | null;
  /** which button it drops from (its caret points there) */
  popFrom?: 'region' | 'wallet' | null;
  onPopClose?: () => void;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const fmt = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** The top bar. Left: the Tessera logo, home. Right, in one capsule: your store country (tap to change)
 *  and your wallet: its balance (tap for the wallet popup) with a + to top up, or Connect wallet. */
export function Header({ wallet, onHome, onConnect, onWallet, onTopUp, region, onRegion, balance, pop, popFrom, onPopClose }: Props) {
  return (
    <motion.header className="bar" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4 }}>
      <button className="bar-logo" onClick={onHome} aria-label="Tessera, home">
        <span className="bar-mark" aria-hidden="true"><b /><b /><b /><b /></span>
        <span>Tessera</span>
      </button>

      <div className="bar-pill">
        <button className="bar-region" onClick={onRegion} aria-label={region ? `Store country ${region.code}. Change` : 'Choose your store country'}>
          {region ? <><span className="bar-flag" aria-hidden="true">{region.flag}</span><span>{region.code}</span></> : <span>Country</span>}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {wallet ? (
          <span className="bar-wallet">
            <button className="bar-bal" onClick={onWallet} aria-haspopup="dialog" aria-label={balance != null ? `Wallet, balance ${fmt(balance)} GRAM` : `Wallet ${short(wallet)}`}>
              {balance != null ? <><b>{fmt(balance)}</b><GramIcon size={15} /></> : <span className="bar-addr">{short(wallet)}</span>}
            </button>
            {onTopUp && (
              <button className="bar-plus" onClick={onTopUp} aria-label="Add GRAM">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>
              </button>
            )}
          </span>
        ) : (
          <button className="bar-connect" onClick={onConnect}>Connect wallet</button>
        )}
      </div>

      <AnimatePresence>
        {pop && (
          <>
            <motion.div key="veil" className="pop-veil" onClick={onPopClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} />
            <motion.div key={pop.key} className={`pop from-${popFrom ?? 'wallet'}${wallet ? '' : ' no-wallet'}`} role="dialog"
              initial={{ opacity: 0, scale: 0.92, y: -6 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ type: 'spring', stiffness: 520, damping: 36 }}>
              {pop.content}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </motion.header>
  );
}
