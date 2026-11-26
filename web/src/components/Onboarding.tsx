// First-run intro: three calm pages on black, each with a real render of the card (made in Blender,
// design/card3d), a short headline and one button, then a last page that connects the TON wallet
// (or leaves it for later). Before it, the buyer picks their store country, which
// can't be skipped. Swipe or tap Continue; Skip jumps to the country (or leaves, once it's chosen).
import { AnimatePresence, motion, useMotionValue, useSpring, useTransform, type PanInfo } from 'framer-motion';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTonAddress, useTonConnectUI } from '@tonconnect/ui-react';
import { Emblem } from './Emblem';
import { GramIcon } from './GramIcon';
import { RegionList, regionNote } from './Region';
import type { Region } from '../api';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';
const BG = '#0a0a0a';

interface Page { img: string; alt: string; title: string; body: string; pull?: boolean; wallet?: boolean; region?: boolean }

const PAGES: Page[] = [
  {
    img: 'ob-front', alt: 'Tessera cards for Claude, ChatGPT and Grok',
    title: 'Your apps, paid in GRAM.',
    body: 'Pay for Claude, ChatGPT and Grok with GRAM from your Telegram wallet.',
  },
  {
    img: 'ob-flat', alt: 'A ChatGPT card being pulled down', pull: true,
    title: 'Pull the card to buy.',
    body: 'Pick a plan, pull the card down, and approve the payment. That’s checkout.',
  },
  {
    img: 'ob-back', alt: 'A Grok card',
    title: 'Your code, in seconds.',
    body: 'You get App Store or Google Play credit. Redeem it, then subscribe in the app.',
  },
  {
    img: '', alt: '', region: true,
    title: 'Where’s your store?',
    body: regionNote,
  },
  {
    img: '', alt: '', wallet: true,
    title: 'Connect your wallet.',
    body: 'Link your TON wallet to pay in GRAM.',
  },
];

const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;

export function Onboarding({ onDone, regions, region, onRegion }: { onDone: () => void; regions: Region[]; region: string | null; onRegion: (code: string) => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const p = PAGES[i];
  const last = i === PAGES.length - 1;
  const [tonConnectUI] = useTonConnectUI();
  const address = useTonAddress();
  // once the wallet is linked on the last page, say so and leave on its own
  useEffect(() => {
    if (!p.wallet || !address) return;
    tg.notify('success');
    const t = setTimeout(() => finishRef.current(), 1400);
    return () => clearTimeout(t);
  }, [p.wallet, address]);

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
  const finishRef = useRef(finish);
  finishRef.current = finish;
  const regionAt = PAGES.findIndex((x) => x.region);
  const go = useCallback((n: number) => {
    if (n < 0) return;
    // the country can't be skipped: going past it needs one chosen
    if (n > regionAt && i <= regionAt && !region) { n = regionAt; if (i === regionAt) { tg.notify('warning'); return; } }
    if (n >= PAGES.length) { finish(); return; }
    setDir(n > i ? 1 : -1);
    setI(n);
    tg.select();
  }, [i, finish, region, regionAt]);

  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 50 && Math.abs(info.velocity.x) < 400) return;
    go(info.offset.x < 0 ? i + 1 : i - 1);
  };

  return (
    <motion.div className="ob" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.4 }} onPanEnd={onPanEnd}>
      <div className="ob-glow" aria-hidden="true" />

      <div className="ob-top">
        <span className="nav-brand"><Emblem size={18} stroke={1.9} /> <span>Tessera</span></span>
        {!last && !(p.region && !region) && <button className="link ob-skip" onClick={() => (region ? finish() : go(regionAt))}>Skip</button>}
      </div>

      <div className="ob-stage">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div key={i} className="ob-art"
            initial={{ opacity: 0, x: dir * 50, rotate: dir * 4 }}
            animate={{ opacity: 1, x: 0, rotate: 0 }}
            exit={{ opacity: 0, x: dir * -50, rotate: dir * -4 }}
            transition={{ duration: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
          >
            {p.region ? (
              <RegionList regions={regions} value={region} onPick={(c) => { tg.select(); onRegion(c); }} />
            ) : p.wallet ? (
              <motion.div className={`ob-wallet ${address ? 'on' : ''}`} style={{ rotateX, rotateY }} animate={{ y: [0, -6, 0] }} transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}>
                <GramIcon size={88} />
                <AnimatePresence>
                  {address && (
                    <motion.span className="ob-wallet-ok" initial={{ scale: 0.4, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ type: 'spring', stiffness: 420, damping: 22 }} aria-hidden="true">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>
                    </motion.span>
                  )}
                </AnimatePresence>
              </motion.div>
            ) : (
              <motion.img
                src={`${BASE}models/${p.img}.webp`} alt={p.alt} draggable={false}
                style={{ rotateX, rotateY }}
                animate={p.pull ? { y: [0, 34, 0] } : { y: [0, -6, 0] }}
                transition={p.pull ? { duration: 2.6, repeat: Infinity, ease: [0.45, 0, 0.25, 1], repeatDelay: 0.4 } : { duration: 5, repeat: Infinity, ease: 'easeInOut' }}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <div className="ob-copy">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.3 }}>
            <h1>{p.wallet && address ? 'Wallet connected.' : p.title}</h1>
            <p>{p.wallet && address ? short(address) : p.body}</p>
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
        {p.wallet && !address ? (
          <div className="ob-actions">
            <motion.button className="btn btn-pearl" onClick={() => { tg.tap('medium'); tonConnectUI.openModal(); }} whileTap={{ scale: 0.97 }}>
              Connect wallet
            </motion.button>
            <button className="link ob-later" onClick={finish}>Not now</button>
          </div>
        ) : (
          <motion.button className="btn btn-pearl" disabled={p.region && !region} onClick={() => { tg.tap('medium'); go(i + 1); }} whileTap={{ scale: 0.97 }}>
            {last ? 'Get started' : 'Continue'}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}
