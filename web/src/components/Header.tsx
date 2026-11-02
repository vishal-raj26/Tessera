import { motion } from 'framer-motion';
import { Emblem } from './Emblem';
import { GramIcon } from './GramIcon';

export type HeaderVariant = 'glass' | 'minimal' | 'personal' | 'balance';

interface Props {
  wallet: string;
  onWallet: () => void;
  onCodes: () => void;
  onHome?: () => void;
  active?: boolean; // the codes view is open
  variant?: HeaderVariant;
  /** codes not yet redeemed, shown as a badge */
  codesCount?: number;
  /** personal bar: first name and the plan line ("Claude Pro · 90 days left") */
  name?: string;
  line?: string;
  /** balance bar: the wallet's GRAM balance, when known */
  balance?: number | null;
}

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

const CodesIcon = ({ size = 20 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <rect x="3" y="7" width="13" height="14" rx="2.5" />
    <path d="M7.5 4.5h9a3 3 0 0 1 3 3v10" />
  </svg>
);
const WalletIcon = ({ size = 18 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
    <rect x="3" y="6" width="18" height="13" rx="3" />
    <path d="M16 12.5h2M3 9h15a3 3 0 0 0-3-3H6" />
  </svg>
);

const enter = { initial: { y: -16, opacity: 0 }, animate: { y: 0, opacity: 1 }, transition: { type: 'spring' as const, stiffness: 180, damping: 22 } };

export function Header({ wallet, onWallet, onCodes, onHome, active, variant = 'glass', codesCount = 0, name, line, balance }: Props) {
  const codes = (cls: string, size?: number) => (
    <motion.button className={`${cls} ${active ? 'is-on' : ''}`} onClick={onCodes} aria-label={active ? 'Back to plans' : `Your codes${codesCount ? `, ${codesCount} to redeem` : ''}`} aria-pressed={active} whileTap={{ scale: 0.9 }}>
      <CodesIcon size={size} />
      {codesCount > 0 && <span className="hb-badge">{codesCount}</span>}
    </motion.button>
  );

  if (variant === 'minimal') {
    return (
      <motion.header className="hb hb-minimal" {...enter}>
        <button className="hb-word" onClick={onHome} aria-label="Tessera">
          <Emblem size={22} stroke={1.8} assemble />
          <span>Tessera</span>
        </button>
        <div className="hb-right">
          {codes('hb-round')}
          <motion.button className={`hb-round ${wallet ? 'on' : ''}`} onClick={onWallet} aria-label={wallet ? `Wallet ${short(wallet)}` : 'Connect wallet'} whileTap={{ scale: 0.9 }}>
            <WalletIcon />
            {wallet && <span className="hb-dot" />}
          </motion.button>
        </div>
      </motion.header>
    );
  }

  if (variant === 'personal') {
    const initial = (name || 'T').trim().charAt(0).toUpperCase();
    return (
      <motion.header className="hb hb-personal" {...enter}>
        <button className="hb-me" onClick={onHome} aria-label="Home">
          <span className="hb-avatar">{initial}</span>
          <span className="hb-me-text">
            <span className="hb-hi">{name ? `Hi ${name}` : 'Welcome to Tessera'}</span>
            {line && <span className="hb-line">{line}</span>}
          </span>
        </button>
        <div className="hb-right">
          {codes('hb-icon')}
          <motion.button className={`hb-icon ${wallet ? 'on' : ''}`} onClick={onWallet} aria-label={wallet ? `Wallet ${short(wallet)}` : 'Connect wallet'} whileTap={{ scale: 0.9 }}>
            <WalletIcon />
            {wallet && <span className="hb-dot" />}
          </motion.button>
        </div>
      </motion.header>
    );
  }

  if (variant === 'balance') {
    return (
      <motion.header className="hb hb-balance" {...enter}>
        <div className="hb-left">
          <button className="hb-logo" onClick={onHome} aria-label="Tessera"><Emblem size={24} stroke={1.8} assemble /></button>
          {codes('hb-icon')}
        </div>
        <motion.button className={`hb-bal ${wallet ? 'on' : ''}`} onClick={onWallet} whileTap={{ scale: 0.95 }} layout>
          {wallet ? (
            <>
              <span className="hb-dot static" />
              <b>{balance != null ? balance.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : short(wallet)}</b>
              {balance != null && <GramIcon size={16} />}
            </>
          ) : (
            <><WalletIcon size={16} /> Connect</>
          )}
        </motion.button>
      </motion.header>
    );
  }

  // the current bar: one floating glass bar, codes on the left, the mark in the middle, wallet on the right
  return (
    <motion.header className="hdr" {...enter}>
      <motion.button className={`hdr-btn ${active ? 'is-on' : ''}`} onClick={onCodes} aria-label={active ? 'Back to plans' : 'Your codes'} aria-pressed={active} whileTap={{ scale: 0.9 }}>
        <CodesIcon />
      </motion.button>
      <button className="hdr-mark" onClick={onHome} aria-label="Tessera">
        <Emblem size={22} stroke={1.8} assemble />
        <motion.span initial={{ opacity: 0, x: -6 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.6, duration: 0.4 }}>
          Tessera
        </motion.span>
      </button>
      <motion.button className={`hdr-btn wallet ${wallet ? 'on' : ''}`} onClick={onWallet} whileTap={{ scale: 0.94 }} layout>
        {wallet ? (<><span className="wallet-dot" />{short(wallet)}</>) : (<><WalletIcon /> Connect</>)}
      </motion.button>
    </motion.header>
  );
}
