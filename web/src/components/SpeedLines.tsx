// Speed lines around the front card while it's held and pulled: light streaks fall past its sides,
// so the card feels like it wants to drop. A calmer layer appears on press, a faster, longer one
// grows with the pull. Pure transform/opacity animation (GPU), paused when not in use.
import { motion, useTransform, type MotionValue } from 'framer-motion';

interface Streak { side: -1 | 1; out: number; len: number; w: number; dur: number; delay: number; warm: boolean }

// Fixed pseudo-random field (same every render): offsets are px outside the card's edge.
const field = (n: number, seed: number, fast: boolean): Streak[] => {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => ({
    side: i % 2 ? 1 : -1,
    out: 4 + rnd() * (fast ? 46 : 60),
    len: (fast ? 70 : 34) + rnd() * (fast ? 90 : 50),
    w: rnd() < 0.25 ? 2 : 1,
    dur: fast ? 0.32 + rnd() * 0.22 : 0.75 + rnd() * 0.5,
    delay: -rnd() * 1.2,
    warm: rnd() < 0.35,
  }));
};
const SLOW = field(10, 7, false);
const FAST = field(16, 31, true);

export function SpeedLines({ hold, pull, max, on }: { hold: MotionValue<number>; pull: MotionValue<number>; max: number; on: boolean }) {
  const slowOpacity = useTransform([hold, pull] as MotionValue<number>[], ([h, p]: number[]) => h * 0.55 * (1 - Math.min(1, p / max)));
  const fastOpacity = useTransform(pull, [0, max * 0.25, max], [0, 0.35, 0.9]);
  const stretch = useTransform(pull, [0, max], [0.8, 1.6]);
  return (
    <div className={`speed ${on ? 'on' : ''}`} aria-hidden="true">
      <motion.div className="speed-layer" style={{ opacity: slowOpacity }}>
        {SLOW.map((l, i) => <i key={i} style={vars(l)} />)}
      </motion.div>
      <motion.div className="speed-layer" style={{ opacity: fastOpacity, scaleY: stretch }}>
        {FAST.map((l, i) => <i key={i} style={vars(l)} />)}
      </motion.div>
    </div>
  );
}

const vars = (l: Streak) => ({
  ['--out' as string]: `${l.out}px`,
  ['--len' as string]: `${l.len}px`,
  ['--w' as string]: `${l.w}px`,
  ['--dur' as string]: `${l.dur}s`,
  ['--delay' as string]: `${l.delay}s`,
  left: l.side < 0 ? 'calc(50% - var(--card-w) / 2 - var(--out) - var(--w))' : 'calc(50% + var(--card-w) / 2 + var(--out))',
  background: l.warm
    ? 'linear-gradient(180deg, transparent, rgba(217, 119, 87, 0.75), transparent)'
    : 'linear-gradient(180deg, transparent, rgba(250, 249, 245, 0.7), transparent)',
});
