// Your dashboard: who you are (your Telegram photo, name and @username, when you joined Tessera) and what
// you've done here (purchases, what you spent, the credit you got, codes still to redeem, your plan, your
// apps), plus your store country and wallet.
import { motion } from 'framer-motion';
import type { ReactNode } from 'react';
import { fmtGram, fmtMoney, fmtStars, type Order, type Region } from '../api';
import { GramIcon } from './GramIcon';
import { StarIcon } from './StarIcon';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';
const short = (a: string) => `${a.slice(0, 4)}…${a.slice(-4)}`;
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

interface Props {
  history: Order[] | null;
  joinedAt: number | null;
  codesLeft: number;
  region: Region | null;
  wallet: string;
  /** the plan line from the home screen (your current plan, with Renew), if you have one */
  plan: ReactNode;
  onCodes: () => void;
  onRegion: () => void;
  onWallet: () => void;
}

export function Profile({ history, joinedAt, codesLeft, region, wallet, plan, onCodes, onRegion, onWallet }: Props) {
  const u = tg.user;
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'You';
  const done = (history ?? []).filter((o) => o.status === 'delivered');
  const gram = done.filter((o) => o.method === 'gram').reduce((n, o) => n + (o.gram || 0), 0);
  const stars = done.filter((o) => o.method === 'stars').reduce((n, o) => n + (o.stars || 0), 0);
  // credit received, per currency (a buyer may have bought in more than one store country)
  const credit = Object.entries(done.reduce<Record<string, number>>((m, o) => ({ ...m, [o.currency]: (m[o.currency] ?? 0) + o.credit }), {}));
  // the apps you've bought, with how many times
  const apps = Object.values(done.reduce<Record<string, { id: string; name: string; n: number }>>((m, o) => {
    const id = o.product?.id ?? 'claude';
    m[id] = { id, name: o.product?.name ?? 'Claude', n: (m[id]?.n ?? 0) + 1 };
    return m;
  }, {})).sort((a, b) => b.n - a.n);

  return (
    <div className="me">
      <motion.header className="me-head" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <span className="me-photo">
          {u?.photo_url ? <img src={u.photo_url} alt="" /> : <span>{name.slice(0, 1)}</span>}
        </span>
        <h1>{name}</h1>
        {u?.username && <p className="me-user">@{u.username}</p>}
        {joinedAt && <p className="me-since">Member since {day(joinedAt)}</p>}
      </motion.header>

      <motion.div className="me-stats" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.08, duration: 0.4 }}>
        <div><small>Purchases</small><b>{done.length}</b></div>
        <div><small>Spent</small><b className="me-spent">
          {gram > 0 && <span>{fmtGram(gram)}<GramIcon size={15} /></span>}
          {stars > 0 && <span>{fmtStars(stars)}<StarIcon size={15} /></span>}
          {gram === 0 && stars === 0 && <span>0</span>}
        </b></div>
        <div><small>Credit received</small><b>{credit.length ? credit.map(([c, v]) => fmtMoney(v, c)).join(' · ') : '0'}</b></div>
        <button onClick={onCodes}><small>Codes to redeem</small><b>{codesLeft}<Chev /></b></button>
      </motion.div>

      {plan && <section className="me-sec"><p className="me-label">Your plan</p>{plan}</section>}

      {apps.length > 0 && (
        <section className="me-sec">
          <p className="me-label">Your apps</p>
          <div className="me-apps">
            {apps.map((a) => (
              <span key={a.id} className={`me-app me-app-${a.id}`}>
                <img src={`${BASE}models/logo-${a.id}.png`} alt="" />
                <span>{a.name}</span>
                <em>{a.n}×</em>
              </span>
            ))}
          </div>
        </section>
      )}

      <section className="me-sec me-rows">
        <button onClick={onRegion}>
          <span>Store country</span>
          <em>{region ? <>{region.flag} {region.name}</> : 'Choose'}</em><Chev />
        </button>
        <button onClick={onWallet}>
          <span>Wallet</span>
          <em className={wallet ? 'mono' : ''}>{wallet ? short(wallet) : 'Connect'}</em><Chev />
        </button>
      </section>
    </div>
  );
}

function Chev() {
  return <svg className="me-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}
