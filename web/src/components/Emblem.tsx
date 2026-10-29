import { motion } from 'framer-motion';

// Tessera emblem: four rounded tiles set as a diamond, drawn in outline like an engraved mark.
// With `assemble`, the tiles fly in from the corners and lock into place.
const TILES = [
  { x: 15.5, y: 3.5, from: [0, -14] },
  { x: 26.5, y: 15.5, from: [14, 0] },
  { x: 15.5, y: 27.5, from: [0, 14] },
  { x: 4.5, y: 15.5, from: [-14, 0] },
];

export function Emblem({ size = 44, stroke = 1.4, assemble = false, spin = false }: { size?: number; stroke?: number; assemble?: boolean; spin?: boolean }) {
  return (
    <motion.svg
      width={size}
      height={size}
      viewBox="0 0 44 44"
      fill="none"
      stroke="currentColor"
      strokeWidth={stroke}
      aria-hidden="true"
      animate={spin ? { rotate: [0, 90] } : undefined}
      transition={spin ? { duration: 1.2, ease: [0.65, 0, 0.35, 1], repeat: Infinity, repeatDelay: 0.6 } : undefined}
    >
      {TILES.map((t, i) => (
        <motion.g
          key={i}
          initial={assemble ? { x: t.from[0], y: t.from[1], opacity: 0 } : false}
          animate={{ x: 0, y: 0, opacity: 1 }}
          transition={{ delay: 0.25 + i * 0.09, type: 'spring', stiffness: 220, damping: 16 }}
        >
          <rect x={t.x} y={t.y} width="13" height="13" rx="3.6" transform={`rotate(45 ${t.x + 6.5} ${t.y + 6.5})`} />
        </motion.g>
      ))}
      <motion.circle
        cx="22" cy="22" r="1.6" fill="currentColor" stroke="none"
        initial={assemble ? { scale: 0 } : false}
        animate={{ scale: 1 }}
        transition={{ delay: 0.75, type: 'spring', stiffness: 400, damping: 12 }}
      />
    </motion.svg>
  );
}
