// A number that counts to its new value (from the old one) instead of jumping. Instant with reduced motion.
import { animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export function CountUp({ value, format }: { value: number; format: (n: number) => string }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    from.current = value;
    if (start === value) return;
    let reduce = false;
    try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    if (reduce) { setShown(value); return; }
    const a = animate(start, value, { duration: 0.6, ease: [0.2, 0.8, 0.2, 1], onUpdate: setShown });
    return () => a.stop();
  }, [value]);
  const text = format(value);
  return <span className="count" aria-label={text}><span aria-hidden="true">{shown === value ? text : format(shown)}</span></span>;
}
