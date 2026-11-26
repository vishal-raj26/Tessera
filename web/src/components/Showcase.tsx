// The first screen: every app on sale as a clean row (its icon on the brand colour, its name and its
// lowest price); tapping one opens its plans. Below, the three things
// every purchase gives you, and a way back to the intro.
import { motion } from 'framer-motion';
import { useState, type ReactNode } from 'react';
import { fmtGram, fmtStars, type PayMethod, type Plan } from '../api';
import { GramIcon } from './GramIcon';
import { StarIcon } from './StarIcon';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';

// The app's icon: its official logo from public/logos/<id>.svg (or .png) on the brand colour, or the
// first letter of its name until a logo file is added.
function AppIcon({ id, name }: { id: string; name: string }) {
  const [src, setSrc] = useState<string | null>(`${BASE}logos/${id}.svg`);
  return (
    <span className="app-icon" aria-hidden="true">
      {src ? (
        <img src={src} alt="" draggable={false} onError={() => setSrc(src.endsWith('.svg') ? `${BASE}logos/${id}.png` : null)} />
      ) : <span className="app-mono">{name.slice(0, 1)}</span>}
    </span>
  );
}

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
      <motion.h1 className="store-head" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        Your AI apps,<br />paid in GRAM.
      </motion.h1>

      <div className="apps">
        {products.map((p, i) => {
          // the lowest one-month price among the app's plans, in the way the buyer pays
          const prices = (plans ?? [])
            .filter((x) => (x.product?.id ?? 'claude') === p.id && x.available)
            .map((x) => x.terms?.find((t) => t.months === 1))
            .map((t) => (payWith === 'stars' ? t?.stars : t?.gram))
            .filter((v): v is number => typeof v === 'number' && v > 0);
          const from = prices.length ? Math.min(...prices) : null;
          return (
            <motion.button
              key={p.id}
              className={`app-row app-${p.id}`}
              aria-label={`${p.name}${from != null ? `, from ${payWith === 'stars' ? `${fmtStars(from)} Stars` : `${fmtGram(from)} GRAM`}` : ''}`}
              onClick={() => { tg.tap('light'); onPick(p.id); }}
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.06 + i * 0.06, duration: 0.4, ease: [0.2, 0.8, 0.2, 1] }}
              whileTap={{ scale: 0.98 }}
            >
              <AppIcon id={p.id} name={p.name} />
              <span className="app-text">
                <span className="app-name">{p.name}</span>
                <span className="app-from">
                  {from != null ? <>from <b>{payWith === 'stars' ? fmtStars(from) : fmtGram(from)}</b>{payWith === 'stars' ? <StarIcon size={13} /> : <GramIcon size={13} />}</> : '\u00a0'}
                </span>
              </span>
              <svg className="app-chev" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
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

      {onHowItWorks && <button className="link store-how" onClick={onHowItWorks}>How it works</button>}
    </div>
  );
}
