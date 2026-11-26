// The first screen: your current plan first (returning buyers), then every app on sale as a quiet dark
// tile printed with its own little logos, its colours (the same holographic picture as its card) rising
// from the right, showing only its name and lowest price; tapping one opens its plans. At the bottom, a
// way back to the intro.
import { motion } from 'framer-motion';
import type { CSSProperties, ReactNode } from 'react';
import { fmtGram, fmtStars, type PayMethod, type Plan } from '../api';
import { GramIcon } from './GramIcon';
import { StarIcon } from './StarIcon';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';

interface Props {
  products: { id: string; name: string }[];
  /** every plan in the catalog, all products (for each app's lowest price) */
  plans: Plan[] | null;
  payWith: PayMethod;
  onPick: (productId: string) => void;
  /** shown above the apps: the buyer's current plan, with Renew */
  notice?: ReactNode;
  /** replays the first-run intro */
  onHowItWorks?: () => void;
  /** your codes (with how many wait to be redeemed), and help (the bot chat) */
  codesCount?: number;
  onCodes?: () => void;
  /** your dashboard */
  onMe?: () => void;
  onHelp?: () => void;
}

export function Showcase({ products, plans, payWith, onPick, notice, onHowItWorks, codesCount = 0, onCodes, onMe, onHelp }: Props) {
  return (
    <div className="store">
      {notice}
      <div className="tiles">
        {products.map((p, i) => {
          // the lowest one-month price among the app's plans, in the way the buyer pays
          const prices = (plans ?? [])
            .filter((x) => (x.product?.id ?? 'claude') === p.id && x.available)
            .map((x) => x.terms?.find((t) => t.months === 1))
            .map((t) => (payWith === 'stars' ? t?.stars : t?.gram))
            .filter((v): v is number => typeof v === 'number' && v > 0);
          const from = prices.length ? Math.min(...prices) : null;
          const open = () => { tg.tap('light'); onPick(p.id); };
          return (
            <motion.button
              key={p.id}
              className={`tile tile-${p.id}`}
              style={{ '--holo': `url(${BASE}models/holo-${p.id}.jpg)`, '--print': `url(${BASE}models/print-${p.id}.png)` } as CSSProperties}
              aria-label={`${p.name}${from != null ? `, from ${payWith === 'stars' ? `${fmtStars(from)} Stars` : `${fmtGram(from)} GRAM`}` : ''}`}
              onClick={open}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.07, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="tile-name">{p.name}</span>
              <span className="tile-foot">
                {from != null ? (
                  <span className="tile-from">from <b>{payWith === 'stars' ? fmtStars(from) : fmtGram(from)}</b>{payWith === 'stars' ? <StarIcon size={13} /> : <GramIcon size={13} />}</span>
                ) : <span className="tile-from">&nbsp;</span>}
                <span className="tile-go" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 6 6 6-6 6" /></svg>
                </span>
              </span>
            </motion.button>
          );
        })}
      </div>

      {/* a small dock: your codes, how it works, help */}
      <motion.nav className="dock" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.4 }} aria-label="More">
        {onCodes && (
          <button onClick={onCodes} aria-label={`Your codes${codesCount ? `, ${codesCount} to redeem` : ''}`}>
            <span className="dock-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3.5 8A1.5 1.5 0 0 1 5 6.5h14A1.5 1.5 0 0 1 20.5 8v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-2a2 2 0 0 0 0-4Z" />
                <path d="M9.5 7v10" strokeDasharray="1.5 2.2" /><path d="M13 10.5h4M13 13.5h2.5" />
              </svg>
              {codesCount > 0 && <i className="dock-badge">{codesCount > 99 ? '99+' : codesCount}</i>}
            </span>
            <span>Codes</span>
          </button>
        )}
        {onHowItWorks && (
          <button onClick={onHowItWorks}>
            <span className="dock-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="8.5" /><path d="M9.7 9.6a2.4 2.4 0 1 1 3.4 2.2c-.7.3-1.1.9-1.1 1.6v.4" /><path d="M12 16.6v.01" strokeWidth="2.2" />
              </svg>
            </span>
            <span>How it works</span>
          </button>
        )}
        {onMe && (
          <button onClick={onMe}>
            <span className="dock-ico">
              {tg.user?.photo_url ? <img className="dock-me" src={tg.user.photo_url} alt="" /> : (
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 19.5a7.5 7.5 0 0 1 15 0" /></svg>
              )}
            </span>
            <span>You</span>
          </button>
        )}
        {onHelp && (
          <button onClick={onHelp}>
            <span className="dock-ico">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M4.5 7A2.5 2.5 0 0 1 7 4.5h10A2.5 2.5 0 0 1 19.5 7v7a2.5 2.5 0 0 1-2.5 2.5h-6l-4.5 3.5v-3.5H7A2.5 2.5 0 0 1 4.5 14Z" />
                <path d="M8.5 10.5h.01M12 10.5h.01M15.5 10.5h.01" strokeWidth="2.4" />
              </svg>
            </span>
            <span>Help</span>
          </button>
        )}
      </motion.nav>

    </div>
  );
}
