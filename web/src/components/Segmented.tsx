// A small pill switch with a sliding highlight (the duration picker's look), for products and stores.
import { motion } from 'framer-motion';

export function Segmented<T extends string>({ options, value, onChange, id, label }: {
  options: { value: T; label: string }[]; value: T; onChange: (v: T) => void; id: string; label: string;
}) {
  return (
    <div className="terms seg" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={o.value} type="button" role="radio" aria-checked={on} className={on ? 'on' : ''} onClick={() => onChange(o.value)}>
            {on && <motion.i layoutId={`seg-${id}`} className="term-bg" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
