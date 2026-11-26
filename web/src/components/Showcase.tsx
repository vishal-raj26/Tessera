// The first screen: every app on sale, and the one gesture Tessera is about. Each app is a tile in its
// own colours (the same holographic picture as its card) showing only what matters: its name and its
// lowest price. Pull a tile down (or tap it) to open that app's plans.
import { motion, type PanInfo } from 'framer-motion';
import type { ReactNode } from 'react';
import { fmtGram, fmtStars, type PayMethod, type Plan } from '../api';
import { GramIcon } from './GramIcon';
import { StarIcon } from './StarIcon';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';
const PULL = 56; // how far a tile is pulled before it opens

interface Props {
  products: { id: string; name: string }[];
  /** every plan in the catalog, all products (for each app's lowest price) */
  plans: Plan[] | null;
  payWith: PayMethod;
  onPick: (productId: string) => void;
  /** shown above the apps (e.g. a plan that's running out) */
  notice?: ReactNode;
}

export function Showcase({ products, plans, payWith, onPick, notice }: Props) {
  return (
    <div className="store">
      {notice}
      <motion.h1 className="store-head" initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
        Your AI apps,<br />paid in GRAM.
      </motion.h1>

      <div className="tiles">
        {products.map((p, i) => {
          // the lowest one-month price among the app's plans, in the way the buyer pays
          const prices = (plans ?? [])
            .filter((x) => (x.product?.id ?? 'claude') === p.id && x.available)
            .map((x) => x.terms?.find((t) => t.months === 1))
            .map((t) => (payWith === 'stars' ? t?.stars : t?.gram))
            .filter((v): v is number => typeof v === 'number' && v > 0);
          const from = prices.length ? Math.min(...prices) : null;
          const open = () => { tg.tap('medium'); onPick(p.id); };
          return (
            <motion.div
              key={p.id}
              className={`tile tile-${p.id}`}
              style={{ backgroundImage: `url(${BASE}models/holo-${p.id}.jpg)` }}
              role="button"
              tabIndex={0}
              aria-label={`${p.name}${from != null ? `, from ${payWith === 'stars' ? `${fmtStars(from)} Stars` : `${fmtGram(from)} GRAM`}` : ''}. Pull down or tap to open.`}
              onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') open(); }}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08 + i * 0.07, duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
              // pulled like the cards: down only, springs back, opens past the pull point
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0, bottom: 0.35 }}
              dragSnapToOrigin
              onDragEnd={(_: PointerEvent, info: PanInfo) => { if (info.offset.y > PULL || info.velocity.y > 600) open(); }}
              onTap={open}
              whileTap={{ scale: 0.985 }}
              whileDrag={{ zIndex: 3, scale: 1.015 }}
            >
              <span className="tile-name">{p.name}</span>
              <span className="tile-foot">
                {from != null ? (
                  <span className="tile-from">from <b>{payWith === 'stars' ? fmtStars(from) : fmtGram(from)}</b>{payWith === 'stars' ? <StarIcon size={14} /> : <GramIcon size={14} />}</span>
                ) : <span className="tile-from">&nbsp;</span>}
                <span className="tile-go" aria-hidden="true">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
                </span>
              </span>
            </motion.div>
          );
        })}
      </div>

      <motion.p className="store-hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.5 }}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
        Pull down to get the sub
      </motion.p>
    </div>
  );
}
