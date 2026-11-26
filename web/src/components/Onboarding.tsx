// First-run intro: three calm pages on black, each with a real render of the card (made in Blender,
// design/card3d), a short headline and one button. Swipe or tap Continue; Skip leaves at once.
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';
import { Emblem } from './Emblem';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';
const BG = '#0a0a0a';

interface Page { img: string; alt: string; title: string; body: string; pull?: boolean }

const PAGES: Page[] = [
  {
    img: 'ob-front', alt: 'A black Tessera card',
    title: 'Your apps, paid in GRAM.',
    body: 'Pay for Claude, ChatGPT and Grok with GRAM from your Telegram wallet, or with Stars.',
  },
  {
    img: 'ob-flat', alt: 'The card being pulled down into a warm light', pull: true,
    title: 'Pull the card to buy.',
    body: 'Pick a plan, pull the card down, and approve the payment. That’s checkout.',
  },
  {
    img: 'ob-back', alt: 'The holographic back of the card',
    title: 'Your code, in seconds.',
    body: 'You get App Store or Google Play credit. Redeem it, then subscribe in the app.',
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const p = PAGES[i];
  const last = i === PAGES.length - 1;

  // the card leans a little with the finger or the phone
  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const tx = useSpring(rawX, { stiffness: 60, damping: 18 });
  const ty = useSpring(rawY, { stiffness: 60, damping: 18 });
  const rotateY = useTransform(tx, (v) => v * 8);
  const rotateX = useTransform(ty, (v) => v * -6);
  useEffect(() => {
    const move = (e: PointerEvent) => { rawX.set((e.clientX / innerWidth - 0.5) * 2); rawY.set((e.clientY / innerHeight - 0.5) * 2); };
    addEventListener('pointermove', move);
    const offTilt = tg.onTilt((x, y) => { rawX.set(x); rawY.set(y); });
    return () => { removeEventListener('pointermove', move); offTilt(); };
  }, [rawX, rawY]);
  useEffect(() => { tg.chrome(BG); }, []);

  const finish = useCallback(() => { tg.chrome(BG); onDone(); }, [onDone]);
  const go = useCallback((n: number) => {
    if (n < 0) return;
    if (n >= PAGES.length) { finish(); return; }
    setDir(n > i ? 1 : -1);
    setI(n);
    tg.select();
  }, [i, finish]);

  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 50 && Math.abs(info.velocity.x) < 400) return;
    go(info.offset.x < 0 ? i + 1 : i - 1);
  };

  return (
    <motion.div className="ob" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onPanEnd={onPanEnd}>
      <div className="ob-glow" aria-hidden="true" />

      <div className="ob-top">
        <span className="nav-brand"><Emblem size={18} stroke={1.9} /> <span>Tessera</span></span>
        {!last && <button className="link ob-skip" onClick={finish}>Skip</button>}
      </div>

      <div className="ob-stage">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={i} className="ob-art"
            initial={{ opacity: 0, x: dir * 50, rotate: dir * 4 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: dir * -50, rotate: dir * -4 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <motion.img
              src={`${BASE}models/${p.img}.webp`} alt={p.alt} draggable={false}
              style={{ rotateX, rotateY }}
              animate={p.pull ? { y: [0, 34, 0] } : { y: [0, -6, 0] }}
              transition={p.pull ? { duration: 2.6, repeat: Infinity, ease: [0.45, 0, 0.25, 1], repeatDelay: 0.4 } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
            />
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="ob-copy">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
            <h1>{p.title}</h1>
            <p>{p.body}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="ob-foot">
        <div className="ob-dots" role="tablist" aria-label="Intro">
          {PAGES.map((_, n) => (
            <button key={n} role="tab" aria-selected={n === i} aria-label={`Page ${n + 1}`} onClick={() => go(n)}>
              <motion.i animate={{ width: n === i ? 18 : 6, opacity: n === i ? 1 : 0.3 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
            </button>
          ))}
        </div>
        <motion.button className="btn btn-pearl" onClick={() => { tg.tap('medium'); go(i + 1); }} whileTap={{ scale: 0.97 }}>
          {last ? 'Get started' : 'Continue'}
        </motion.button>
      </div>
    </motion.div>
  );
}
