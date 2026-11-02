// The opening moment: small tiles fly in from around the screen and click together into the first
// card (a tessera is a mosaic tile), then the real card takes its place. About one second, once per
// session, never with reduced motion. Transform and opacity only, so it stays smooth on phones.
import { motion } from 'framer-motion';
import { useMemo } from 'react';
import { TIERS } from '../tiers';

const COLS = 5;
const ROWS = 8; // 5:8 is the card's shape (0.63)
/** When the tiles have formed the card (seconds): the carousel shows the real card from here. */
export const MOSAIC_FORMED = 0.8;

let played = false;
/** Whether to play it now: once per session (and once per page load), and not with reduced motion. */
export function shouldPlayMosaic(): boolean {
  if (played) return false;
  played = true;
  try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false; } catch { /* ignore */ }
  try {
    if (sessionStorage.getItem('tessera.mosaic')) return false;
    sessionStorage.setItem('tessera.mosaic', '1');
  } catch { /* no storage: play it this once */ }
  return true;
}

export function MosaicIntro({ tier = 0 }: { tier?: number }) {
  const t = TIERS[tier] ?? TIERS[0];
  const tiles = useMemo(() => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    return Array.from({ length: COLS * ROWS }, (_, i) => {
      const c = i % COLS, r = Math.floor(i / COLS);
      // tiles nearer the middle land first, so the card forms from its centre outwards
      const dist = Math.hypot(c - (COLS - 1) / 2, (r - (ROWS - 1) / 2) * 0.8);
      const angle = rnd() * Math.PI * 2;
      const far = 140 + rnd() * 220;
      return {
        c, r,
        from: { x: Math.cos(angle) * far, y: Math.sin(angle) * far - 40, rotate: (rnd() - 0.5) * 220, scale: 0.35 + rnd() * 0.4 },
        delay: dist * 0.06 + rnd() * 0.05,
        shade: 0.82 + rnd() * 0.36,
      };
    });
  }, []);
  return (
    <motion.div
      className="mosaic"
      aria-hidden="true"
      initial={{ opacity: 1 }}
      animate={{ opacity: 0 }}
      transition={{ delay: MOSAIC_FORMED, duration: 0.25 }}
    >
      {tiles.map(({ c, r, from, delay, shade }) => (
        <motion.i
          key={`${c}:${r}`}
          style={{
            left: `${(c / COLS) * 100}%`, top: `${(r / ROWS) * 100}%`,
            width: `${100 / COLS}%`, height: `${100 / ROWS}%`,
            // a slightly lighter or darker piece of the card's own gradient (no filters: cheap on phones)
            backgroundImage: `linear-gradient(${shade > 1 ? `rgba(255,255,255,${(shade - 1) * 0.35})` : `rgba(0,0,0,${(1 - shade) * 0.6})`} 0 0), linear-gradient(160deg, ${t.body[0]}, ${t.body[2]} 62%)`,
            backgroundSize: `100% 100%, ${COLS * 100}% ${ROWS * 100}%`,
            backgroundPosition: `0 0, ${(c / (COLS - 1)) * 100}% ${(r / (ROWS - 1)) * 100}%`,
            boxShadow: `inset 0 0 0 1px ${t.tile}33`,
          }}
          initial={{ ...from, opacity: 0 }}
          animate={{ x: 0, y: 0, rotate: 0, scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 110, damping: 17, mass: 0.8, delay }}
        />
      ))}
    </motion.div>
  );
}
