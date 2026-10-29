// Swipe sideways to pick a plan; pull the front card down to buy it.
import { animate, motion, useMotionValue, useTransform, type MotionValue, type PanInfo } from 'framer-motion';
import { memo, useEffect, useRef, useState } from 'react';
import { Portal } from './Portal';
import { HoloCard } from './HoloCard';
import { fmtMoney, termLabel, type Plan } from '../api';
import { tg } from '../tg';

interface Props {
  plans: Plan[];
  index: number;
  onIndex: (i: number) => void;
  onPull: () => void;
  disabled?: boolean;
  months: number;
  /** optional shared pull distance, so the page can react while the card is pulled */
  pull?: MotionValue<number>;
  /** optional shared hold amount (0…1 while the front card is pressed) */
  hold?: MotionValue<number>;
}

const PULL = 110;

function Slot({ i, pos, pull, hold, fallEnd, plan, active, onTap, months }: {
  i: number; pos: MotionValue<number>; pull: MotionValue<number>; hold: MotionValue<number>; fallEnd: MotionValue<number>; plan: Plan; active: boolean; onTap: () => void; months: number;
}) {
  // pressed in slightly while held; past the pull point it starts to fall into the portal:
  // it shrinks, tips forward and fades as the pull carries it down
  // fall progress: 0 at the pull point, 1 with the card's centre in the portal
  const fall = useTransform([pull, fallEnd] as MotionValue<number>[], ([p, end]: number[]) =>
    (active ? Math.max(0, Math.min(1, (p - PULL * 1.05) / (end - PULL * 1.05))) : 0));
  const press = useTransform([hold, fall] as MotionValue<number>[], ([h, f]: number[]) => (!active ? 1 : (1 - h * 0.035) * (1 - f * 0.92)));
  const tip = useTransform(fall, (f) => f * 62);
  const fade = useTransform(fall, (f) => (f < 0.6 ? 1 : Math.max(0, 1 - (f - 0.6) / 0.4)));
  const t = plan.terms?.find((x) => x.months === months) ?? plan.terms?.[0];
  const off = useTransform(pos, (p) => i - p);
  const x = useTransform(off, (o) => `${o * 74}%`);
  const scale = useTransform(off, (o) => 1 - Math.min(Math.abs(o), 1.2) * 0.2);
  const rotateY = useTransform(off, (o) => o * -26);
  const rotateZ = useTransform(off, (o) => o * 4);
  const opacity = useTransform(off, (o) => 1 - Math.min(Math.abs(o), 2) * 0.38);
  const z = useTransform(off, (o) => 10 - Math.round(Math.abs(o) * 3));
  const y = useTransform([off, pull] as MotionValue<number>[], ([o, p]: number[]) => (Math.abs(o) < 0.5 ? p : 0) + Math.abs(o) * 18);
  return (
    <motion.div className="slot" style={{ x, y, scale, rotateY, rotateZ, opacity, zIndex: z }} onTap={active ? undefined : onTap}>
      {/* dealt in like a hand of cards on first load */}
      <motion.div
        initial={{ y: 320, rotate: -18 + i * 14, opacity: 0, scale: 0.85 }}
        animate={{ y: 0, rotate: 0, opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 120, damping: 17, delay: 0.35 + i * 0.12 }}
      >
        <motion.div style={{ scale: press, rotateX: tip, opacity: fade, transformPerspective: 700 }}>
          <HoloCard
            planId={plan.id}
            credit={t ? fmtMoney(t.credit, t.currency) : undefined}
            term={t ? termLabel(t.months) : undefined}
            interactive={active}
            idle={active}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export const PlanCarousel = memo(function PlanCarousel({ plans, index, onIndex, onPull, disabled, months, pull: sharedPull, hold: sharedHold }: Props) {
  const pos = useMotionValue(index);
  const ownPull = useMotionValue(0);
  const pull = sharedPull ?? ownPull;
  const axis = useRef<'x' | 'y' | null>(null);
  // holding the front card: speed lines appear and the card presses in
  const ownHold = useMotionValue(0);
  const hold = sharedHold ?? ownHold;
  // where the fall ends: the card's centre in the portal (half a card + the portal's distance below it)
  const fallEnd = useMotionValue(PULL + 200);
  const [holding, setHolding] = useState(false);
  const off = useRef<ReturnType<typeof setTimeout>>(undefined);
  const press = () => {
    if (disabled || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    clearTimeout(off.current);
    setHolding(true);
    animate(hold, 1, { duration: 0.18, ease: 'easeOut' });
  };
  const release = () => {
    animate(hold, 0, { duration: 0.28, ease: 'easeOut' });
    clearTimeout(off.current);
    // pause the portal once everything has faded and the card is back (or has fallen in)
    const settle = () => { off.current = setTimeout(() => (pull.get() < 1 ? setHolding(false) : settle()), 300); };
    settle();
  };
  const width = useRef(260);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { animate(pos, index, { type: 'spring', stiffness: 260, damping: 30 }); }, [index, pos]);
  useEffect(() => {
    width.current = (stage.current?.querySelector('.card-wrap') as HTMLElement)?.offsetWidth || 260;
    fallEnd.set(width.current / 0.63 / 2 + 130); // matches --land (170px) minus the zone's 40px overlap
  });

  const onPan = (_: PointerEvent, info: PanInfo) => {
    if (!axis.current) {
      axis.current = Math.abs(info.offset.x) > Math.abs(info.offset.y) ? 'x' : 'y';
      if (axis.current === 'x') release(); // swiping sideways, not pulling
    }
    if (axis.current === 'x') {
      const step = width.current * 0.74;
      const p = index - info.offset.x / step;
      pos.set(Math.max(-0.35, Math.min(plans.length - 0.65, p)));
    } else if (!disabled) {
      const d = Math.max(0, info.offset.y);
      pull.set(d < PULL ? d : PULL + (d - PULL) * 0.35);
      if (d >= PULL && pull.getPrevious()! < PULL) tg.tap('medium');
    }
  };

  const onPanEnd = (_: PointerEvent, info: PanInfo) => {
    if (axis.current === 'x') {
      const step = width.current * 0.74;
      const projected = index - (info.offset.x + info.velocity.x * 0.15) / step;
      const next = Math.max(0, Math.min(plans.length - 1, Math.round(projected)));
      if (next !== index) { tg.select(); onIndex(next); }
      else animate(pos, index, { type: 'spring', stiffness: 260, damping: 30 });
    } else if (axis.current === 'y') {
      if (!disabled && info.offset.y > PULL) {
        // the card falls into the portal, then the review opens
        animate(pull, fallEnd.get(), { duration: 0.46, ease: [0.5, 0, 0.9, 0.45] }).then(() => {
          tg.tap('heavy');
          onPull();
          // the sheet now covers the stage: put the card back and close the portal at once,
          // so nothing keeps animating behind the sheet
          clearTimeout(off.current);
          pull.set(0);
          hold.set(0);
          setHolding(false);
        });
      } else {
        animate(pull, 0, { type: 'spring', stiffness: 300, damping: 22 });
      }
    }
    axis.current = null;
  };

  return (
    <motion.div
      ref={stage}
      className="carousel"
      onPan={onPan}
      onPanEnd={onPanEnd}
      onPointerDown={press}
      onPointerUp={release}
      onPointerCancel={release}
      role="listbox"
      aria-label="Plans"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && index < plans.length - 1) onIndex(index + 1);
        if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
        if (e.key === 'Enter' && !disabled) onPull();
      }}
    >
      <Portal hold={hold} pull={pull} max={PULL} on={holding} />
      {plans.map((p, i) => (
        <Slot key={p.id} i={i} pos={pos} pull={pull} hold={hold} fallEnd={fallEnd} plan={p} active={i === index} onTap={() => { tg.select(); onIndex(i); }} months={months} />
      ))}
      <Portal hold={hold} pull={pull} max={PULL} on={holding} lip />
    </motion.div>
  );
});
