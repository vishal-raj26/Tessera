// Rays around the front card while it's held and pulled: light streaks run down both its sides (and
// out from under it) from the card's top to where the pull ends. A calmer set on press, a faster,
// longer set that grows with the pull. Transform-only animation; paused and hidden when not held.
import { motion, useTransform, type MotionValue } from 'framer-motion';

// side: -1 left of the card, 1 right of it, 0 behind it (seen only once it leaves the card's bottom)
interface Ray { side: -1 | 0 | 1; at: number; len: number; w: number; dur: number; delay: number; tint: 0 | 1 | 2 }

function field(n: number, seed: number, fast: boolean): Ray[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, (_, i) => {
    const side = (i % 5 === 4 ? 0 : i % 2 ? 1 : -1) as Ray['side'];
    return {
      side,
      at: side === 0 ? (rnd() * 2 - 1) * 0.42 : 3 + rnd() * 34, // behind: across the card; sides: px outside its edge
      len: (fast ? 90 : 50) + rnd() * (fast ? 130 : 70),
      w: rnd() < 0.35 ? 3 : 2,
      dur: fast ? 0.42 + rnd() * 0.28 : 0.9 + rnd() * 0.5,
      delay: -rnd() * 1.6,
      tint: rnd() < 0.4 ? 1 : rnd() < 0.5 ? 2 : 0,
    };
  });
}
const CALM = field(10, 11, false);
const RUSH = field(18, 47, true);
const TINT = [
  'linear-gradient(180deg, transparent, rgba(250, 249, 245, 0.95) 60%, transparent)',
  'linear-gradient(180deg, transparent, rgba(217, 119, 87, 0.95) 60%, transparent)',
  'linear-gradient(180deg, transparent, rgba(246, 211, 180, 0.95) 60%, transparent)',
];

export function Rays({ hold, pull, max, on }: { hold: MotionValue<number>; pull: MotionValue<number>; max: number; on: boolean }) {
  const p = useTransform(pull, (v) => Math.max(0, v) / max); // 0 … 1 at the pull point
  const calm = useTransform([hold, p] as MotionValue<number>[], ([h, q]: number[]) => h * 0.85 * (1 - Math.min(1, q * 1.4)));
  const rush = useTransform(p, [0, 0.12, 1], [0, 0.6, 1]);
  const stretch = useTransform(p, [0, 1, 1.5], [0.75, 1.3, 1.5]);
  return (
    <div className={`rays ${on ? 'on' : ''}`} aria-hidden="true">
      <motion.div className="rays-layer" style={{ opacity: calm }}>
        {CALM.map((r, i) => <i key={i} style={vars(r)} />)}
      </motion.div>
      <motion.div className="rays-layer" style={{ opacity: rush, scaleY: stretch }}>
        {RUSH.map((r, i) => <i key={i} style={vars(r)} />)}
      </motion.div>
    </div>
  );
}

const vars = (r: Ray) => ({
  ['--len' as string]: `${r.len}px`,
  ['--w' as string]: `${r.w}px`,
  ['--dur' as string]: `${r.dur}s`,
  ['--delay' as string]: `${r.delay}s`,
  left: r.side === 0 ? `calc(50% + ${r.at} * var(--card-w))`
    : r.side < 0 ? `calc(50% - var(--card-w) / 2 - ${r.at}px - var(--w))` : `calc(50% + var(--card-w) / 2 + ${r.at}px)`,
  background: TINT[r.tint],
});
