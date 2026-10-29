// The card. Matte black with silver type; a pearl-foil layer wipes across it (`reveal` 0→1),
// and a light-reactive holo sheen follows tilt (`mx`/`my`, 0–100).
import { motion, useMotionTemplate, useMotionValue, useSpring, useTransform, type MotionValue } from 'framer-motion';
import { memo, useEffect, useRef, type ReactNode } from 'react';
import { Emblem } from './Emblem';
import type { PlanId } from '../api';
import { tg } from '../tg';

export const PLAN_LABEL: Record<PlanId, string> = { pro_m: 'Pro', max5_m: 'Max 5×', max20_m: 'Max 20×' };

interface Face {
  planId: PlanId;
  credit?: string;
  region?: string;
  /** footer term, e.g. "3 months" */
  term?: string;
  /** replaces the top line, e.g. date + status in the wallet stack */
  top?: ReactNode;
}

function FaceContent({ planId, credit, region, term, top }: Face) {
  const name = PLAN_LABEL[planId];
  return (
    <div className="cc">
      <div className={`cc-top ${top ? 'split' : ''}`}>{top ?? 'App Store credit for Claude'}</div>
      <div className="cc-mark"><Emblem /></div>
      <div className={`cc-name ${name.length > 4 ? 'long' : ''}`}>{name}</div>
      <div className="cc-foot">
        <span>{credit ? `Credit ${credit}` : 'Credit'}</span>
        <span>{term ?? region ?? '1 month'}</span>
      </div>
    </div>
  );
}

interface Props extends Face {
  reveal?: MotionValue<number> | number;
  flipped?: boolean;
  interactive?: boolean; // follow pointer / device tilt
  back?: ReactNode;
  className?: string;
  idle?: boolean; // slow automatic sway
}

export const HoloCard = memo(function HoloCard({ planId, credit, region, term, top, reveal = 0, flipped = false, interactive = false, back, className = '', idle = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const px = useMotionValue(0.5);
  const py = useMotionValue(0.5);
  const sx = useSpring(px, { stiffness: 140, damping: 18 });
  const sy = useSpring(py, { stiffness: 140, damping: 18 });

  const rotY = useTransform(sx, [0, 1], [-16, 16]);
  const rotX = useTransform(sy, [0, 1], [12, -12]);
  // The light effects follow the tilt by *moving* oversized gradient layers (GPU transforms),
  // never by changing gradient positions, which would repaint the whole card every frame.
  const pearlX = useTransform(sx, (v) => `${(0.5 - v) * 28}%`);
  const pearlY = useTransform(sy, (v) => `${(0.5 - v) * 28}%`);
  const holoX = useTransform(sx, (v) => `${-61.5 * (1 - v)}%`);
  const holoY = useTransform(sy, (v) => `${-61.5 * v}%`);
  const glareX = useTransform(sx, (v) => `${(v - 0.5) * 50}%`);
  const glareY = useTransform(sy, (v) => `${(v - 0.5) * 50}%`);

  const fallback = useMotionValue(typeof reveal === 'number' ? reveal : 0);
  const rev = typeof reveal === 'number' ? fallback : reveal;
  useEffect(() => { if (typeof reveal === 'number') fallback.set(reveal); }, [reveal, fallback]);
  const wipeA = useTransform(rev, (r) => `${r * 150 - 30}%`);
  const wipeB = useTransform(rev, (r) => `${r * 150}%`);
  const mask = useMotionTemplate`linear-gradient(115deg, #000 ${wipeA}, transparent ${wipeB})`;
  const flip = useSpring(flipped ? 180 : 0, { stiffness: 90, damping: 16 });
  useEffect(() => { flip.set(flipped ? 180 : 0); }, [flipped, flip]);
  const rotYTotal = useTransform([rotY, flip] as MotionValue<number>[], ([a, b]: number[]) => a + b);

  // pointer + gyro tilt
  useEffect(() => {
    if (!interactive) return;
    const el = ref.current;
    const move = (e: PointerEvent) => {
      const r = el!.getBoundingClientRect();
      px.set(Math.min(1, Math.max(0, (e.clientX - r.left) / r.width)));
      py.set(Math.min(1, Math.max(0, (e.clientY - r.top) / r.height)));
    };
    const leave = () => { px.set(0.5); py.set(0.5); };
    el?.addEventListener('pointermove', move);
    el?.addEventListener('pointerleave', leave);
    const offTilt = tg.onTilt((x, y) => { px.set(0.5 + x * 0.5); py.set(0.5 + y * 0.5); });
    return () => {
      el?.removeEventListener('pointermove', move);
      el?.removeEventListener('pointerleave', leave);
      offTilt();
    };
  }, [interactive, px, py]);

  // idle sway so the foil catches light even when nobody touches it (paused while the app is hidden)
  useEffect(() => {
    if (!idle || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const s = (t - t0) / 1000;
      if (!document.hidden && !ref.current?.matches(':hover')) {
        px.set(0.5 + Math.sin(s * 0.7) * 0.28);
        py.set(0.5 + Math.cos(s * 0.5) * 0.18);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [idle, px, py]);

  // Only a card that moves (touched, tilting or swaying) gets the moving light layers, and the
  // pearl layer only exists once it shows. Each extra layer costs every frame on phones.
  const live = interactive || idle;
  const pearlShown = typeof reveal !== 'number' || reveal > 0;
  const fullPearl = reveal === 1;
  const face = <FaceContent planId={planId} credit={credit} region={region} term={term} top={top} />;

  return (
    <div ref={ref} className={`card-wrap ${live ? 'live' : ''} ${className}`}>
      <motion.div
        className={`card plan-${planId}`}
        style={{ rotateX: rotX, rotateY: rotYTotal }}
      >
        <div className="face front">
          <div className="layer base">{face}</div>
          {pearlShown && (
            <motion.div className="layer pearl" style={fullPearl ? undefined : { WebkitMaskImage: mask, maskImage: mask }}>
              {live ? <motion.div className="pearl-bg" style={{ x: pearlX, y: pearlY }} /> : <div className="pearl-bg" />}
              {face}
            </motion.div>
          )}
          {live ? <motion.div className="holo" style={{ x: holoX, y: holoY }} /> : <div className="holo still" />}
          {live && <motion.div className="glare" style={{ x: glareX, y: glareY }} />}
          <div className="rim" />
        </div>
        <div className="face back">
          <div className="stripe" />
          <div className="back-body">{back}</div>
          {live && <motion.div className="holo" style={{ x: holoX, y: holoY }} />}
          <div className="rim" />
        </div>
      </motion.div>
    </div>
  );
});
