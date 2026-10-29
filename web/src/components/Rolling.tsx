import { AnimatePresence, motion } from 'framer-motion';

/** Number whose digits roll like an odometer when the value changes. */
export function Rolling({ text, dir = 1 }: { text: string; dir?: number }) {
  return (
    <span className="roll" aria-label={text}>
      {text.split('').map((ch, i) => (
        <span key={i} className="roll-slot" aria-hidden="true">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch + i}
              initial={{ y: `${dir * 100}%`, opacity: 0 }}
              animate={{ y: '0%', opacity: 1 }}
              exit={{ y: `${-dir * 100}%`, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26, delay: i * 0.025 }}
            >
              {ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
