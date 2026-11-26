// The bottom bar: Home, Codes and You, on every main screen, in an oval with the current one lit.
import { motion } from 'framer-motion';
import { tg } from '../tg';

export type Tab = 'home' | 'codes' | 'me';

interface Props {
  active: Tab;
  codesCount: number;
  onHome: () => void;
  onCodes: () => void;
  onMe: () => void;
}

const I = { width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.7, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true } as const;

export function Dock({ active, codesCount, onHome, onCodes, onMe }: Props) {
  const photo = tg.user?.photo_url;
  const tabs = [
    { id: 'home', label: 'Home', on: onHome, icon: <svg {...I}><path d="M4 10.5 12 4l8 6.5V19a1.5 1.5 0 0 1-1.5 1.5h-4v-6h-5v6h-4A1.5 1.5 0 0 1 4 19Z" /></svg> },
    { id: 'codes', label: 'Codes', on: onCodes, icon: (
      <svg {...I}>
        <path d="M3.5 8A1.5 1.5 0 0 1 5 6.5h14A1.5 1.5 0 0 1 20.5 8v2a2 2 0 0 0 0 4v2a1.5 1.5 0 0 1-1.5 1.5H5A1.5 1.5 0 0 1 3.5 16v-2a2 2 0 0 0 0-4Z" />
        <path d="M9.5 7v10" strokeDasharray="1.5 2.2" /><path d="M13 10.5h4M13 13.5h2.5" />
      </svg>
    ), badge: codesCount },
    { id: 'me', label: 'You', on: onMe, icon: photo ? <img className="dock-me" src={photo} alt="" /> : <svg {...I}><circle cx="12" cy="8.5" r="3.8" /><path d="M4.5 19.5a7.5 7.5 0 0 1 15 0" /></svg> },
  ] as const;

  return (
    <motion.nav className="dock" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35 }} aria-label="Main">
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <button key={t.id} className={on ? 'on' : ''} aria-current={on ? 'page' : undefined} onClick={() => { if (!on) { tg.select(); t.on(); } }}>
            {on && <motion.i layoutId="dock-on" className="dock-on" transition={{ type: 'spring', stiffness: 520, damping: 40 }} />}
            <span className="dock-ico">
              {t.icon}
              {'badge' in t && t.badge > 0 && <i className="dock-badge">{t.badge > 99 ? '99+' : t.badge}</i>}
            </span>
            <span className="dock-label">{t.label}</span>
          </button>
        );
      })}
    </motion.nav>
  );
}
