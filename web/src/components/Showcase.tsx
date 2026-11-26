// The first screen: your current plan first (returning buyers), then every app on sale as a dark tile
// printed with its own little logos on a diagonal, its colours glowing up from the bottom, and in the
// middle its name, its plans and its lowest price; tapping one opens its plans.
import { motion } from 'framer-motion';
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { fmtGram, type Plan } from '../api';
import { GramIcon } from './GramIcon';
import { CountUp } from './CountUp';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';
// prices count up from zero only the first time the home screen shows in a session
let counted = false;
// seconds until the opening logo has faded (index.html's splash, ~2.2 s after load), so the count is seen
const splashLeft = () => Math.max(0, 2.2 - performance.now() / 1000);

interface Props {
  products: { id: string; name: string }[];
  /** every plan in the catalog, all products (for each app's lowest price) */
  plans: Plan[] | null;
  onPick: (productId: string) => void;
  /** shown above the apps: the buyer's current plan, with Renew */
  notice?: ReactNode;
  /** replays the intro: a quiet text link under the apps, only until the buyer's first purchase */
  onGuide?: () => void;
}

export function Showcase({ products, plans, onPick, notice, onGuide }: Props) {
  const [countUp] = useState(() => !counted);
  useEffect(() => { if (plans?.length) counted = true; }, [plans]);
  return (
    <div className="store">
      {notice}
      <div className="tiles">
        {products.map((p, i) => {
          // the app's plans on sale, and the lowest one-month GRAM price among them
          const mine = (plans ?? []).filter((x) => (x.product?.id ?? 'claude') === p.id && x.available);
          const prices = mine
            .map((x) => x.terms?.find((t) => t.months === 1))
            .map((t) => t?.gram)
            .filter((v): v is number => typeof v === 'number' && v > 0);
          const from = prices.length ? Math.min(...prices) : null;
          const open = () => { tg.tap('light'); onPick(p.id); };
          return (
            <motion.button
              key={p.id}
              className={`tile tile-${p.id}`}
              style={{ '--holo': `url(${BASE}models/holo-${p.id}.jpg)`, '--print': `url(${BASE}models/print-${p.id}.png)`, '--drift-delay': `${-i * 3.3}s` } as CSSProperties}
              aria-label={`${p.name}${from != null ? `, from ${fmtGram(from)} GRAM` : ''}`}
              onClick={open}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.07, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              whileTap={{ scale: 0.98 }}
            >
              <span className="tile-grain" aria-hidden="true" />
              <span className="tile-name">{p.name}</span>
              {mine.length > 0 && <span className="tile-plans">{mine.map((x) => x.label ?? x.name).join(' · ')}</span>}
              <span className="tile-from">{from != null ? <>from <b>{countUp ? <CountUp value={from} format={fmtGram} from={0} delay={splashLeft() + 0.1 + i * 0.08} duration={1.1} /> : fmtGram(from)}</b><GramIcon size={13} /></> : '\u00a0'}</span>
            </motion.button>
          );
        })}
        {onGuide && (
          <button className="guide-link" onClick={() => { tg.select(); onGuide(); }}>How Tessera works</button>
        )}
      </div>


    </div>
  );
}
