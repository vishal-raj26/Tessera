// First-run intro in the style of App Store screenshots: one colour per screen, a serif headline,
// and a phone running a mini version of the real app. Only things that show the product move.
import { AnimatePresence, animate, motion, useMotionValue, useSpring, useTransform, type MotionValue, type PanInfo } from 'framer-motion';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { HoloCard } from './HoloCard';
import { GramIcon } from './GramIcon';
import { Emblem } from './Emblem';
import { tg } from '../tg';

const AUTO_MS = 7000;
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Slide {
  bg: string; ink: string; sub: string; btn: string; btnInk: string;
  title: [string, string];
  body: string;
  glow: [string, string];
}

const SLIDES: Slide[] = [
  {
    bg: '#d97757', ink: '#fff8f2', sub: 'rgba(255,248,242,0.82)', btn: '#141413', btnInk: '#faf9f5',
    title: ['Your subscriptions,', 'paid in GRAM.'],
    body: 'Pay for the apps you use with GRAM from your Telegram wallet, or with Stars.',
    glow: ['#f2b393', '#c4603d'],
  },
  {
    bg: '#f0eee6', ink: '#141413', sub: 'rgba(20,20,19,0.64)', btn: '#d97757', btnInk: '#fff8f2',
    title: ['Pull the card.', "That's checkout."],
    body: 'Swipe to pick a plan, pull the card down, then approve the payment in your wallet.',
    glow: ['#f3d8c2', '#e9c1a8'],
  },
  {
    bg: '#1f1e1d', ink: '#faf9f5', sub: 'rgba(250,249,245,0.64)', btn: '#d97757', btnInk: '#fff8f2',
    title: ['Code in seconds.', 'Subscribed in minutes.'],
    body: 'You get an App Store or Google Play code. Redeem it, then subscribe in the app.',
    glow: ['#5a3527', '#2b2421'],
  },
];

/* --- gentle parallax from finger / phone tilt ----------------------------- */
const Tilt = createContext<{ x: MotionValue<number>; y: MotionValue<number> } | null>(null);
function useDepth(depth: number) {
  const t = useContext(Tilt)!;
  return { x: useTransform(t.x, (v) => v * depth), y: useTransform(t.y, (v) => v * depth) };
}
function Layer({ depth, className, children }: { depth: number; className?: string; children: ReactNode }) {
  const { x, y } = useDepth(depth);
  return <motion.div className={className} style={{ x, y }}>{children}</motion.div>;
}

/* --- the phone ----------------------------------------------------------- */
function Phone({ children, tilt = 0, ry = -12, back = false, x = 0, depth = 10 }: {
  children: ReactNode; tilt?: number; ry?: number; back?: boolean; x?: number; depth?: number;
}) {
  const p = useDepth(depth);
  const t = useContext(Tilt)!;
  const rY = useTransform(t.x, (v) => ry + v * 0.5);
  return (
    <motion.div
      className={`ph-wrap ${back ? 'back' : ''}`}
      initial={{ y: 240, x, rotate: tilt - 6, opacity: 0 }}
      animate={{ y: back ? 30 : 0, x, rotate: tilt, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 90, damping: 18, delay: back ? 0.1 : 0.2 }}
    >
      <motion.div style={{ x: p.x, y: p.y, rotateY: rY }}>
        <div className="ph">
          <div className="ph-screen">
            <div className="ph-island" />
            {children}
          </div>
        </div>
      </motion.div>
      <div className="ph-floor" aria-hidden="true" />
    </motion.div>
  );
}

function MiniHeader() {
  return (
    <div className="mini-hdr">
      <span className="mini-btn" />
      <span className="mini-mark"><Emblem size={11} stroke={2.2} /> Tessera</span>
      <span className="mini-btn wide" />
    </div>
  );
}

/* --- screen 1: the plans, and where they end up ---------------------------- */
function ShotHome() {
  return (
    <div className="shot">
      <Phone tilt={11} ry={-20} back x={104} depth={5}>
        <MiniHeader />
        <div className="mini-reveal"><HoloCard className="mini-card front" planId="max20_m" reveal={1} credit="$275" /></div>
        <div className="mini-done">Your credit is ready</div>
        <div className="mini-cta">Redeem in App Store</div>
      </Phone>
      <Phone tilt={-5} ry={10} x={-30} depth={10}>
        <MiniHeader />
        <div className="mini-title">Choose your plan</div>
        <div className="mini-carousel">
          <div className="mini-side l"><HoloCard className="mini-card" planId="pro_m" /></div>
          <div className="mini-side r"><HoloCard className="mini-card" planId="max20_m" /></div>
          <HoloCard className="mini-card front" planId="max5_m" idle />
        </div>
        <div className="mini-price">102.82<GramIcon size={14} /></div>
      </Phone>
    </div>
  );
}

/* --- screen 2: the real pull-to-buy, step by step ------------------------- */
function ShotPull() {
  const cardY = useMotionValue(0);
  const cardScale = useMotionValue(1);
  const cardOpacity = useMotionValue(1);
  const fingerOpacity = useMotionValue(0);
  const fingerScale = useMotionValue(1.15);
  const sheetY = useMotionValue(110);
  const sheetPct = useTransform(sheetY, (v) => `${v}%`);
  const hintOpacity = useTransform(cardY, [0, 40], [1, 0]);
  const [phase, setPhase] = useState<'idle' | 'sheet' | 'pressed' | 'approved'>('idle');

  useEffect(() => {
    let alive = true;
    (async () => {
      await wait(900);
      while (alive) {
        setPhase('idle');
        cardY.set(0); cardScale.set(1); cardOpacity.set(1); sheetY.set(110);
        fingerOpacity.set(0); fingerScale.set(1.15);
        await wait(600); if (!alive) return;
        await Promise.all([
          animate(fingerOpacity, 1, { duration: 0.2 }),
          animate(fingerScale, 0.85, { duration: 0.25, ease: 'easeOut' }),
          animate(cardScale, 0.97, { duration: 0.25 }),
        ]);
        await wait(150); if (!alive) return;
        await animate(cardY, 64, { duration: 0.8, ease: [0.3, 0.7, 0.4, 1] });
        tg.tap('light');
        if (!alive) return;
        animate(fingerOpacity, 0, { duration: 0.15 });
        animate(cardScale, 0.92, { duration: 0.3 });
        await animate(cardY, 300, { duration: 0.32, ease: [0.4, 0, 1, 1] });
        cardOpacity.set(0);
        if (!alive) return;
        setPhase('sheet');
        await animate(sheetY, 0, { type: 'spring', stiffness: 260, damping: 28 });
        await wait(700); if (!alive) return;
        setPhase('pressed');
        tg.tap('light');
        await wait(420); if (!alive) return;
        setPhase('approved');
        await wait(2200); if (!alive) return;
        await animate(sheetY, 110, { duration: 0.35, ease: [0.4, 0, 1, 1] });
        cardY.set(-30);
        cardScale.set(1);
        await Promise.all([animate(cardOpacity, 1, { duration: 0.3 }), animate(cardY, 0, { type: 'spring', stiffness: 200, damping: 20 })]);
      }
    })();
    return () => { alive = false; };
  }, [cardY, cardScale, cardOpacity, fingerOpacity, fingerScale, sheetY]);

  return (
    <div className="shot">
      <Phone tilt={4} ry={-14} depth={10}>
        <MiniHeader />
        <div className="mini-title">Choose your plan</div>
        <div className="mini-carousel">
          <div className="mini-side l"><HoloCard className="mini-card" planId="pro_m" /></div>
          <div className="mini-side r"><HoloCard className="mini-card" planId="max20_m" /></div>
          <motion.div className="mini-drag" style={{ y: cardY, scale: cardScale, opacity: cardOpacity }}>
            <HoloCard className="mini-card front" planId="max5_m" idle />
            <motion.span className="mini-finger" style={{ opacity: fingerOpacity, scale: fingerScale }} />
          </motion.div>
        </div>
        <motion.div className="mini-price" style={{ opacity: hintOpacity }}>102.82<GramIcon size={14} /></motion.div>
        <motion.div className="mini-hint" style={{ opacity: hintOpacity }}><span className="chev"><span /><span /></span>Pull the card down to buy</motion.div>

        <motion.div className="mini-sheet" style={{ y: sheetPct }}>
          <span className="mini-grab" />
          <div className="mini-sum">
            <HoloCard className="mini-card tiny" planId="max5_m" />
            <div><b>Claude Max 5×</b><span>1 month</span></div>
          </div>
          <div className="mini-line"><span>You pay</span><b>102.82<GramIcon size={10} /></b></div>
          <motion.div className="mini-pay" animate={{ scale: phase === 'pressed' ? 0.94 : 1 }} transition={{ type: 'spring', stiffness: 500, damping: 18 }}>
            Pay 102.82<GramIcon size={10} />
          </motion.div>
        </motion.div>
      </Phone>

      <Layer depth={16} className="ob-pops">
        <AnimatePresence>
          {phase !== 'idle' && (
            <motion.div
              key="pay"
              className="pop pay"
              initial={{ scale: 0.6, opacity: 0, x: 30, y: 190, rotate: 0 }}
              animate={{ scale: phase === 'pressed' ? 0.92 : 1, opacity: 1, x: 44, y: 150, rotate: -6 }}
              exit={{ opacity: 0, scale: 0.85, y: 180 }}
              transition={{ type: 'spring', stiffness: 300, damping: 18 }}
            >
              Pay <span className="amt">102.82<GramIcon size={18} /></span>
            </motion.div>
          )}
          {phase === 'approved' && (
            <motion.div
              key="ok"
              className="pop check"
              initial={{ scale: 0.6, opacity: 0, x: -50, y: -90, rotate: 0 }}
              animate={{ scale: 1, opacity: 1, x: -56, y: -112, rotate: 6 }}
              exit={{ opacity: 0, transition: { duration: 0.25 } }}
              transition={{ type: 'spring', stiffness: 260, damping: 18 }}
            >
              <span className="tick" />
              Approved in wallet
            </motion.div>
          )}
        </AnimatePresence>
      </Layer>
    </div>
  );
}

/* --- screen 3: the card turns pearl and the code comes out ----------------- */
function ShotReveal() {
  const reveal = useMotionValue(0);
  const [code, setCode] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      while (alive) {
        reveal.set(0); setCode(false);
        await wait(900);
        await animate(reveal, 1, { duration: 1.3, ease: [0.65, 0, 0.35, 1] });
        if (!alive) return;
        setCode(true);
        await wait(3200);
      }
    })();
    return () => { alive = false; };
  }, [reveal]);
  return (
    <div className="shot">
      <Phone tilt={-3} ry={12} depth={10}>
        <MiniHeader />
        <div className="mini-reveal">
          <HoloCard className="mini-card front" planId="max20_m" reveal={reveal} credit="$275" />
        </div>
        <div className="mini-done">Your credit is ready</div>
        <div className="mini-row" />
        <div className="mini-cta">Redeem in App Store</div>
      </Phone>
      <Layer depth={16} className="ob-pops">
        <AnimatePresence>
          {code && (
            <motion.div
              className="pop code"
              initial={{ scale: 0.85, opacity: 0, x: 4, y: 120, rotate: 0 }}
              animate={{ scale: 0.94, opacity: 1, x: 4, y: 92, rotate: -4 }}
              exit={{ opacity: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 20 }}
            >
              XK7Q <i>••••</i> <i>••••</i> 9M2F
              <span className="copied">Copy</span>
            </motion.div>
          )}
        </AnimatePresence>
      </Layer>
    </div>
  );
}

const SHOTS = [ShotHome, ShotPull, ShotReveal];

/* --- the flow ------------------------------------------------------------- */
export function Onboarding({ onDone }: { onDone: () => void }) {
  const [i, setI] = useState(0);
  const [dir, setDir] = useState(1);
  const s = SLIDES[i];
  const last = i === SLIDES.length - 1;

  const rawX = useMotionValue(0);
  const rawY = useMotionValue(0);
  const tx = useSpring(rawX, { stiffness: 50, damping: 16 });
  const ty = useSpring(rawY, { stiffness: 50, damping: 16 });
  useEffect(() => {
    const move = (e: PointerEvent) => { rawX.set((e.clientX / innerWidth - 0.5) * 2); rawY.set((e.clientY / innerHeight - 0.5) * 2); };
    addEventListener('pointermove', move);
    const offTilt = tg.onTilt((x, y) => { rawX.set(x); rawY.set(y); });
    return () => { removeEventListener('pointermove', move); offTilt(); };
  }, [rawX, rawY]);

  useEffect(() => { tg.chrome(s.bg); }, [s.bg]);

  const finish = useCallback(() => { tg.chrome('#141413'); onDone(); }, [onDone]);
  const go = useCallback((n: number) => {
    if (n < 0) return;
    if (n >= SLIDES.length) { finish(); return; }
    setDir(n > i ? 1 : -1);
    setI(n);
    tg.select();
  }, [i, finish]);

  const fill = useMotionValue(0);
  const fillW = useTransform(fill, (v) => `${v * 100}%`);
  useEffect(() => {
    fill.set(0);
    if (last) return;
    const c = animate(fill, 1, { duration: AUTO_MS / 1000, ease: 'linear' });
    const t = setTimeout(() => go(i + 1), AUTO_MS);
    return () => { c.stop(); clearTimeout(t); };
  }, [i, last, go, fill]);

  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    if (Math.abs(info.offset.x) < 50 && Math.abs(info.velocity.x) < 400) return;
    go(info.offset.x < 0 ? i + 1 : i - 1);
  };

  const Shot = SHOTS[i];
  return (
    <Tilt.Provider value={{ x: tx, y: ty }}>
      <motion.div
        className="ob"
        style={{ ['--ob-ink' as string]: s.ink, ['--ob-sub' as string]: s.sub, ['--ob-bg' as string]: s.bg }}
        initial={{ backgroundColor: SLIDES[0].bg, opacity: 0 }}
        animate={{ backgroundColor: s.bg, opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        onPanEnd={onPanEnd}
      >
        <motion.div
          className="ob-glow"
          aria-hidden="true"
          animate={{ background: `radial-gradient(70% 45% at 50% 62%, ${s.glow[0]} 0%, transparent 70%), radial-gradient(60% 40% at 100% 100%, ${s.glow[1]} 0%, transparent 70%)` }}
          transition={{ duration: 0.6 }}
        />

        <div className="ob-row">
          <span className="ob-brand"><Emblem size={18} stroke={1.8} /> Tessera</span>
          {!last && <button className="ob-skip" onClick={finish}>Skip</button>}
        </div>

        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={i}
            className="ob-page"
            initial={{ opacity: 0, x: dir * 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: dir * -40 }}
            transition={{ duration: 0.3, ease: [0.2, 0.8, 0.2, 1] }}
          >
            <h1 className="ob-h">
              {s.title.map((line, n) => (
                <span key={n} className={`ob-line ${n === 1 ? 'it' : ''}`}>
                  <motion.span initial={{ y: '100%' }} animate={{ y: 0 }} transition={{ duration: 0.6, ease: [0.2, 0.8, 0.2, 1], delay: 0.05 + n * 0.08 }}>
                    {line}
                  </motion.span>
                </span>
              ))}
            </h1>
            <motion.p className="ob-p" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.4, delay: 0.25 }}>
              {s.body}
            </motion.p>
            <Shot />
          </motion.div>
        </AnimatePresence>

        <div className="ob-foot">
          <div className="ob-dots">
            {SLIDES.map((_, n) => (
              <button key={n} aria-label={`Screen ${n + 1}`} onClick={() => go(n)}>
                <motion.i animate={{ width: n === i ? 22 : 7, opacity: n === i ? 1 : 0.35 }} transition={{ type: 'spring', stiffness: 400, damping: 32 }} />
              </button>
            ))}
          </div>
          <motion.button
            className="ob-next"
            onClick={() => { tg.tap('medium'); go(i + 1); }}
            animate={{ backgroundColor: s.btn, color: s.btnInk, width: last ? 160 : 120 }}
            whileTap={{ scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
          >
            <motion.span className="ob-fill" style={{ width: fillW }} aria-hidden="true" />
            <span className="ob-next-t">{last ? 'Get started' : 'Next'}</span>
          </motion.button>
        </div>
      </motion.div>
    </Tilt.Provider>
  );
}
