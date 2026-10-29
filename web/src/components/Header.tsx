import { motion } from 'framer-motion';
import { Emblem } from './Emblem';

interface Props {
  wallet: string;
  onWallet: () => void;
  onCodes: () => void;
  onHome?: () => void;
  codesCount?: number;
  active?: boolean; // the codes view is open
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

/** One floating glass bar: codes on the left, the mark in the middle, wallet on the right. */
export function Header({ wallet, onWallet, onCodes, onHome, active }: Props) {
  return (
    <motion.header
      className="hdr"
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 180, damping: 22 }}
    >
      <motion.button className={`hdr-btn ${active ? 'is-on' : ''}`} onClick={onCodes} aria-label={active ? 'Back to plans' : 'Your codes'} aria-pressed={active} whileTap={{ scale: 0.9 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
          <rect x="3" y="7" width="13" height="14" rx="2.5" />
          <path d="M7.5 4.5h9a3 3 0 0 1 3 3v10" />
        </svg>
      </motion.button>

      <button className="hdr-mark" onClick={onHome} aria-label="Tessera">
        <Emblem size={22} stroke={1.8} assemble />
        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.4 }}>
          Tessera
        </motion.span>
      </button>

      <motion.button className={`hdr-btn wallet ${wallet ? 'on' : ''}`} onClick={onWallet} whileTap={{ scale: 0.94 }} layout>
        {wallet ? (
          <>
            <span className="wallet-dot" />
            {short(wallet)}
          </>
        ) : (
          <>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <rect x="3" y="6" width="18" height="13" rx="3" />
              <path d="M16 12.5h2M3 9h15a3 3 0 0 0-3-3H6" />
            </svg>
            Connect
          </>
        )}
      </motion.button>
    </motion.header>
  );
}
