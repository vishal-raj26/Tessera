// The first screen: every app on sale as a quiet dark tile with its own colours (the same holographic
// picture as its card) rising from the right, showing only its name and lowest price; tapping one opens
// its plans. Below, the three things every purchase gives you; under the title, a way back to the intro.
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
  /** shown above the apps (e.g. a plan that's running out) */
  notice?: ReactNode;
  /** replays the first-run intro */
  onHowItWorks?: () => void;
}

export function Showcase({ products, plans, payWith, onPick, notice, onHowItWorks }: Props) {
  return (
    <div className="store">
      {notice}
      <motion.div className="store-head" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        <h1>Your AI apps,<br />paid in GRAM.</h1>
        {onHowItWorks && <button className="link store-how" onClick={onHowItWorks}>How it works</button>}
      </motion.div>

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
              style={{ '--holo': `url(${BASE}models/holo-${p.id}.jpg)` } as CSSProperties}
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

      <motion.ul className="perks" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.35 }}>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5" /><path d="M9 12h6M12 9v6" /></svg>
          <span>Pay in GRAM or Stars</span>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M13 3 5 14h6l-1 7 8-11h-6z" /></svg>
          <span>Code in seconds</span>
        </li>
        <li>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="3" width="10" height="18" rx="2.5" /><path d="M11 18h2" /></svg>
          <span>iPhone and Android</span>
        </li>
      </motion.ul>

    </div>
  );
}
