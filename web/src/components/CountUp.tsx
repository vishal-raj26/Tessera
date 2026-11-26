// A number that counts to its new value (from the old one) instead of jumping. `from` makes it count up
// from that number when it first appears; `delay` waits before counting. Instant with reduced motion.
import { animate } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';

export function CountUp({ value, format, from: startAt, delay = 0, duration = 0.6 }: { value: number; format: (n: number) => string; from?: number; delay?: number; duration?: number }) {
  const [shown, setShown] = useState(startAt ?? value);
  // counts from whatever is on screen now, so an interrupted count (or a re-run effect) picks up where it is
  const at = useRef(startAt ?? value);
  useEffect(() => {
    const start = at.current;
    if (start === value) return;
    let reduce = false;
    try { reduce = matchMedia('(prefers-reduced-motion: reduce)').matches; } catch { /* ignore */ }
    if (reduce) { at.current = value; setShown(value); return; }
    const a = animate(start, value, { duration, delay, ease: [0.2, 0.8, 0.2, 1], onUpdate: (v) => { at.current = v; setShown(v); } });
    return () => a.stop();
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  const text = format(value);
  return <span className="count" aria-label={text}><span aria-hidden="true">{shown === value ? text : format(shown)}</span></span>;
}
