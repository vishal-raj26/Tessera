// Your dashboard: who you are (your Telegram photo, name and @username, when you joined), your invite
// link with what it has earned you, and what you've done here (purchases, spent, credit received, apps).
// Store country, wallet, codes and your plan live in the top bar, the dock and the home screen, so they
// aren't repeated here.
import { motion } from 'framer-motion';
import { fmtGram, fmtMoney, type Order, type Referral } from '../api';
import { GramIcon } from './GramIcon';
import { tg } from '../tg';

const BASE = import.meta.env.BASE_URL ?? '/';
const day = (t: number) => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });
const rise = (delay: number) => ({ initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { delay, duration: 0.4 } });

interface Props {
  history: Order[] | null;
  joinedAt: number | null;
  referral: Referral | null;
  onCopied: (what: string) => void;
}

export function Profile({ history, joinedAt, referral, onCopied }: Props) {
  const u = tg.user;
  const name = [u?.first_name, u?.last_name].filter(Boolean).join(' ') || 'You';
  const done = (history ?? []).filter((o) => o.status === 'delivered');
  // what you actually sent (referral credit that came off an order isn't spending)
  const gram = done.filter((o) => o.method === 'gram').reduce((n, o) => n + (o.gram || 0), 0);
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
      <motion.header className="me-head" {...rise(0)}>
        <span className="me-photo">
          {u?.photo_url ? <img src={u.photo_url} alt="" /> : <span>{name.slice(0, 1)}</span>}
        </span>
        <h1>{name}</h1>
        {u?.username && <p className="me-user">@{u.username}</p>}
        {joinedAt && <p className="me-since">Member since {day(joinedAt)}</p>}
      </motion.header>

      <motion.div {...rise(0.06)}><Invite r={referral} onCopied={onCopied} /></motion.div>

      <motion.div className="me-stats" {...rise(0.12)}>
        <div><small>Purchases</small><b>{done.length}</b></div>
        <div><small>Spent</small><b className="me-spent">
          <span>{fmtGram(gram)}<GramIcon size={14} /></span>
        </b></div>
        <div><small>Credit received</small><b className="me-spent">{credit.length ? credit.map(([c, v]) => <span key={c}>{fmtMoney(v, c)}</span>) : <span>0</span>}</b></div>
      </motion.div>

      {apps.length > 0 && (
        <motion.section className="me-sec" {...rise(0.18)}>
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
        </motion.section>
      )}
    </div>
  );
}

/** The invite card: the one bright thing on the dashboard. */
function Invite({ r, onCopied }: { r: Referral | null; onCopied: (what: string) => void }) {
  const link = r?.link ?? null;
  const share = () => {
    if (!link) return;
    tg.tap('light');
    const text = 'Get Claude, ChatGPT and Grok with GRAM, right inside Telegram.';
    tg.openTelegramLink(`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent(text)}`);
  };
  const copy = () => {
    if (!link) return;
    navigator.clipboard?.writeText(link).then(() => { tg.notify('success'); onCopied('Invite link copied'); }).catch(() => {});
  };
  return (
    <section className="invite">
      <div className="invite-in">
        <div className="invite-top">
          <span className="invite-gift" aria-hidden="true">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="8" width="18" height="4" rx="1" /><path d="M12 8v13M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" /><path d="M7.5 8a2.5 2.5 0 0 1 0-5C10 3 12 8 12 8s2-5 4.5-5a2.5 2.5 0 0 1 0 5" /></svg>
          </span>
          <div>
            <h2>Invite friends</h2>
            <p>Earn GRAM credit when they buy</p>
          </div>
        </div>

        <dl className="invite-stats">
          <div><dt>Joined</dt><dd>{r?.invited ?? 0}</dd></div>
          <div><dt>Bought</dt><dd>{r?.bought ?? 0}</dd></div>
          <div><dt>Earned</dt><dd>{fmtGram(r?.earned ?? 0)}<GramIcon size={13} /></dd></div>
        </dl>

        <div className="invite-actions">
          <motion.button className="btn invite-share" onClick={share} disabled={!link} whileTap={link ? { scale: 0.97 } : undefined}>Share invite</motion.button>
          <motion.button className="invite-copybtn" onClick={copy} disabled={!link} aria-label="Copy invite link" whileTap={link ? { scale: 0.92 } : undefined}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="9" y="9" width="12" height="12" rx="2.5" /><path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" /></svg>
          </motion.button>
        </div>
      </div>
    </section>
  );
}
