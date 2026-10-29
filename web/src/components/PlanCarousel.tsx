// Swipe sideways to pick a plan; pull the front card down to buy it.
import { animate, motion, useMotionValue, useTransform, type MotionValue, type PanInfo } from 'framer-motion';
import { useEffect, useRef } from 'react';
import { HoloCard } from './HoloCard';
import { fmtMoney, type Plan } from '../api';
import { tg } from '../tg';

interface Props {
  plans: Plan[];
  index: number;
  onIndex: (i: number) => void;
  onPull: () => void;
  disabled?: boolean;
}

const PULL = 110;

function Slot({ i, pos, pull, plan, active, onTap }: {
  i: number; pos: MotionValue<number>; pull: MotionValue<number>; plan: Plan; active: boolean; onTap: () => void;
}) {
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
        <motion.div animate={active ? { y: [0, -8, 0] } : { y: 0 }} transition={active ? { duration: 4.5, repeat: Infinity, ease: 'easeInOut' } : { duration: 0.4 }}>
          <HoloCard
            planId={plan.id}
            credit={plan.available ? fmtMoney(plan.credit!, plan.currency!) : undefined}
            interactive={active}
            idle={active}
          />
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function PlanCarousel({ plans, index, onIndex, onPull, disabled }: Props) {
  const pos = useMotionValue(index);
  const pull = useMotionValue(0);
  const axis = useRef<'x' | 'y' | null>(null);
  const width = useRef(260);
  const stage = useRef<HTMLDivElement>(null);

  useEffect(() => { animate(pos, index, { type: 'spring', stiffness: 260, damping: 30 }); }, [index, pos]);
  useEffect(() => { width.current = (stage.current?.querySelector('.card-wrap') as HTMLElement)?.offsetWidth || 260; });

  const onPan = (_: PointerEvent, info: PanInfo) => {
    if (!axis.current) axis.current = Math.abs(info.offset.x) > Math.abs(info.offset.y) ? 'x' : 'y';
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
        tg.tap('heavy');
        animate(pull, 420, { duration: 0.32, ease: [0.4, 0, 1, 1] }).then(() => {
          onPull();
          setTimeout(() => animate(pull, 0, { type: 'spring', stiffness: 200, damping: 24 }), 350);
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
      role="listbox"
      aria-label="Plans"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' && index < plans.length - 1) onIndex(index + 1);
        if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1);
        if (e.key === 'Enter' && !disabled) onPull();
      }}
    >
      {plans.map((p, i) => (
        <Slot key={p.id} i={i} pos={pos} pull={pull} plan={p} active={i === index} onTap={() => { tg.select(); onIndex(i); }} />
      ))}
    </motion.div>
  );
}
