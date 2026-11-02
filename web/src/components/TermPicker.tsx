// How long: 1 month, 3, 6, or Apple's yearly plan (Pro only). A sliding highlight marks the choice.
import { motion } from 'framer-motion';
import type { Term } from '../api';

const short = (m: number) => (m === 12 ? '1 year' : m === 1 ? '1 month' : `${m} months`);

export function TermPicker({ terms, months, onChange }: { terms: Term[]; months: number; onChange: (m: number) => void }) {
  return (
    <div className="terms" role="radiogroup" aria-label="How long">
      {terms.map((t) => {
        const on = t.months === months;
        return (
          <button key={t.months} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => onChange(t.months)}>
            {on && <motion.i layoutId="term-bg" className="term-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>{short(t.months)}</span>
          </button>
        );
      })}
    </div>
  );
}
