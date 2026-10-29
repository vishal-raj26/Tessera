// The portal under the front card. Holding the card opens it; pulling grows it and pours light
// streaks from the card's bottom edge down into it; past the pull point it opens fully and ripples;
// released there, the card falls in (PlanCarousel handles the fall). Transform/opacity only, and the
// animations are paused and hidden whenever the card isn't held.
import { motion, useTransform, type MotionValue } from 'framer-motion';

interface Streak { x: number; len: number; w: number; dur: number; delay: number; tint: 0 | 1 | 2 }

// A fixed pseudo-random field: x is the start across the card's width (-0.6 … 0.6 of it).
function field(n: number, seed: number, fast: boolean): Streak[] {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  return Array.from({ length: n }, () => ({
    x: (rnd() * 2 - 1) * 0.62,
    len: (fast ? 60 : 36) + rnd() * (fast ? 110 : 60),
    w: rnd() < 0.3 ? 3 : 2,
    dur: fast ? 0.34 + rnd() * 0.24 : 0.7 + rnd() * 0.4,
    delay: -rnd() * 1.4,
    tint: rnd() < 0.4 ? 1 : rnd() < 0.5 ? 2 : 0,
  }));
}
const CALM = field(7, 11, false);
const RUSH = field(15, 47, true);
const TINT = [
  'linear-gradient(180deg, transparent, rgba(250, 249, 245, 0.95) 55%, transparent)',
  'linear-gradient(180deg, transparent, rgba(217, 119, 87, 0.95) 55%, transparent)',
  'linear-gradient(180deg, transparent, rgba(246, 211, 180, 0.95) 55%, transparent)',
];

// The swirling ring, painted once into an image: rotating a plain image is nearly free, whereas a
// rotating masked gradient can repaint every frame.
let ringUrl = '';
function ringTexture(): string {
  if (ringUrl || typeof document === 'undefined') return ringUrl;
  const n = 256, c = document.createElement('canvas');
  c.width = c.height = n;
  const g = c.getContext('2d');
  if (!g || !('createConicGradient' in g)) return '';
  const conic = g.createConicGradient(0, n / 2, n / 2);
  const stops: [number, string][] = [[0, 'rgba(246,211,180,0)'], [0.12, 'rgba(246,211,180,0.95)'], [0.26, 'rgba(246,211,180,0)'],
    [0.44, 'rgba(217,119,87,0.9)'], [0.58, 'rgba(217,119,87,0)'], [0.74, 'rgba(250,249,245,0.85)'], [0.9, 'rgba(250,249,245,0)'], [1, 'rgba(246,211,180,0)']];
  for (const [o, col] of stops) conic.addColorStop(o, col);
  g.fillStyle = conic;
  g.fillRect(0, 0, n, n);
  // keep only a soft ring band
  g.globalCompositeOperation = 'destination-in';
  const band = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
  band.addColorStop(0.44, 'rgba(0,0,0,0)'); band.addColorStop(0.52, 'rgba(0,0,0,1)');
  band.addColorStop(0.68, 'rgba(0,0,0,1)'); band.addColorStop(0.74, 'rgba(0,0,0,0)');
  g.fillStyle = band;
  g.fillRect(0, 0, n, n);
  ringUrl = `url(${c.toDataURL()})`;
  return ringUrl;
}

/** `lip` is the near half of the opening, drawn over the card so a falling card sinks into it. */
export function Portal({ hold, pull, max, on, lip = false }: { hold: MotionValue<number>; pull: MotionValue<number>; max: number; on: boolean; lip?: boolean }) {
  const p = useTransform(pull, (v) => Math.max(0, v) / max); // 0 … 1 at the pull point, more beyond
  const open = useTransform([hold, p] as MotionValue<number>[], ([h, q]: number[]) => Math.min(1, h * 0.35 + q * 0.75));
  const portalScale = useTransform([hold, p] as MotionValue<number>[], ([h, q]: number[]) => 0.25 + h * 0.15 + Math.min(q, 1) * 0.6 + Math.max(0, Math.min(q - 1, 0.4)) * 0.4);
  const calmOpacity = useTransform([hold, p] as MotionValue<number>[], ([h, q]: number[]) => h * 0.7 * (1 - Math.min(1, q * 1.5)));
  const rushOpacity = useTransform(p, [0, 0.15, 1], [0, 0.55, 1]);
  const rushStretch = useTransform(p, [0, 1, 1.6], [0.7, 1.25, 1.5]);
  const beam = useTransform(p, [0, 1], [0, 0.85]);
  const ready = useTransform(p, (q) => (q >= 1 ? 1 : 0));
  const ring = { backgroundImage: ringTexture() };
  if (lip) {
    return (
      <div className={`portal-zone lip ${on ? 'on' : ''}`} aria-hidden="true">
        <motion.div className="portal" style={{ opacity: open, scale: portalScale }}>
          <div className="portal-near">{/* crops to the near half of the opening */}
            <div className="portal-disc">
              <div className="portal-ring" />
              <div className="portal-core" />
            </div>
          </div>
        </motion.div>
      </div>
    );
  }
  return (
    <div className={`portal-zone ${on ? 'on' : ''}`} aria-hidden="true">
      <motion.div className="portal-beam" style={{ opacity: beam }} />
      <motion.div className="streaks" style={{ opacity: calmOpacity }}>
        {CALM.map((l, i) => <i key={i} style={vars(l)} />)}
      </motion.div>
      <motion.div className="streaks rush" style={{ opacity: rushOpacity, scaleY: rushStretch }}>
        {RUSH.map((l, i) => <i key={i} style={vars(l)} />)}
      </motion.div>
      <motion.div className="portal" style={{ opacity: open, scale: portalScale }}>
        <div className="portal-disc">
          <div className="portal-halo" />
          <div className="portal-swirl" style={ring} />
          <div className="portal-ring" />
          <div className="portal-core" />
          <motion.div className="portal-ripples" style={{ opacity: ready }}><i /><i /></motion.div>
        </div>
      </motion.div>
    </div>
  );
}

const vars = (l: Streak) => ({
  ['--x' as string]: l.x,
  ['--len' as string]: `${l.len}px`,
  ['--w' as string]: `${l.w}px`,
  ['--dur' as string]: `${l.dur}s`,
  ['--delay' as string]: `${l.delay}s`,
  background: TINT[l.tint],
});
