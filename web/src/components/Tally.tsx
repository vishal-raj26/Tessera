// A number that counts up from zero when it appears (the amount on the done screen). Instant with
// reduced motion.
import { animate } from 'framer-motion';
import { useEffect, useState } from 'react';

export function Tally({ value, format, duration = 1.5, delay = 0 }: { value: number; format: (n: number) => string; duration?: number; delay?: number }) {
  const [reduce] = useState(() => { try { return matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { return false; } });
  const [shown, setShown] = useState(() => (reduce ? value : 0));
  useEffect(() => {
    if (reduce) return;
    const a = animate(0, value, { duration, delay, ease: [0.16, 1, 0.3, 1], onUpdate: setShown });
    return () => a.stop();
  }, [value, duration, delay, reduce]);
  const text = format(value);
  return <span className="tally" aria-label={text}><span aria-hidden="true">{reduce || shown === value ? text : format(shown)}</span></span>;
}
