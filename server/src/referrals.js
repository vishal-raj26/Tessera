// Referrals: a buyer shares their link (t.me/<bot>?startapp=ref_<code>). Whoever opens Tessera for the
// first time through it is theirs for good. Every GRAM purchase that friend has delivered earns the
// referrer a share of what Tessera made on it (REF_SHARE of our margin, never of the price), as GRAM
// credit that comes off their next GRAM order. Stars purchases earn nothing.
//
// Credit is a ledger (credits table), one row per event, so the balance is always its sum:
//   reward  +  a referred friend's order was delivered      (once per order)
//   spend   -  credit taken off one of your orders           (once per order, when the order is made)
//   release +  that order never went through (expired past the late window, or refunded)
// Guards: you can't refer yourself (same account or a wallet you've paid from), only brand-new users
// count, rewards only on delivery, and a monthly cap per referrer (REF_MONTHLY_CAP_USD).
import crypto from 'node:crypto';

const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const MONTH_MS = 30 * 86400e3;

export function createReferrals({ db, margin, share = 0.25, monthlyCapUsd = 25, normalize = (w) => w, now = () => Date.now() }) {
  db.exec(`
  CREATE TABLE IF NOT EXISTS ref_codes (user_id TEXT PRIMARY KEY, code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS referrals (user_id TEXT PRIMARY KEY, referrer_id TEXT NOT NULL, created_at INTEGER NOT NULL);
  CREATE INDEX IF NOT EXISTS referrals_by ON referrals(referrer_id);
  CREATE TABLE IF NOT EXISTS credits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    kind TEXT NOT NULL,
    amount_nano INTEGER NOT NULL,
    usd REAL NOT NULL DEFAULT 0,
    order_id TEXT NOT NULL,
    from_user TEXT,
    created_at INTEGER NOT NULL,
    UNIQUE(kind, order_id)
  );
  CREATE INDEX IF NOT EXISTS credits_user ON credits(user_id);
  `);

  const q = {
    codeOf: db.prepare('SELECT code FROM ref_codes WHERE user_id = ?'),
    ownerOf: db.prepare('SELECT user_id FROM ref_codes WHERE code = ?'),
    addCode: db.prepare('INSERT OR IGNORE INTO ref_codes (user_id, code, created_at) VALUES (?,?,?)'),
    referrer: db.prepare('SELECT referrer_id FROM referrals WHERE user_id = ?'),
    addRef: db.prepare('INSERT OR IGNORE INTO referrals (user_id, referrer_id, created_at) VALUES (?,?,?)'),
    invited: db.prepare('SELECT COUNT(*) AS n FROM referrals WHERE referrer_id = ?'),
    bought: db.prepare(`SELECT COUNT(DISTINCT r.user_id) AS n FROM referrals r JOIN orders o ON o.tg_user_id = r.user_id
      WHERE r.referrer_id = ? AND o.status = 'delivered' AND o.method = 'gram'`),
    balance: db.prepare('SELECT COALESCE(SUM(amount_nano), 0) AS n FROM credits WHERE user_id = ?'),
    earned: db.prepare("SELECT COALESCE(SUM(amount_nano), 0) AS n FROM credits WHERE user_id = ? AND kind = 'reward'"),
    earnedUsdSince: db.prepare("SELECT COALESCE(SUM(usd), 0) AS n FROM credits WHERE user_id = ? AND kind = 'reward' AND created_at > ?"),
    entry: db.prepare('SELECT * FROM credits WHERE kind = ? AND order_id = ?'),
    add: db.prepare('INSERT OR IGNORE INTO credits (user_id, kind, amount_nano, usd, order_id, from_user, created_at) VALUES (?,?,?,?,?,?,?)'),
    wallets: db.prepare('SELECT DISTINCT wallet FROM orders WHERE tg_user_id = ? AND wallet IS NOT NULL'),
  };

  /** The user's own referral code, made the first time it's asked for. */
  function codeFor(uid) {
    uid = String(uid);
    let code = q.codeOf.get(uid)?.code;
    while (!code) {
      const c = Array.from(crypto.randomBytes(8), (b) => ALPHABET[b % ALPHABET.length]).join('');
      if (q.addCode.run(uid, c, now()).changes === 1) code = c;
      else code = q.codeOf.get(uid)?.code; // someone else has that code (retry), or we raced ourselves
    }
    return code;
  }

  /**
   * A user opened the app with a start parameter. Links them to the referrer only if they are new here
   * (`isNew`: never seen and no orders), the code is real, it isn't their own, and they aren't linked yet.
   */
  function claim(uid, startParam, { isNew }) {
    uid = String(uid);
    const m = /^ref_([a-z0-9]{6,16})$/.exec(String(startParam || ''));
    if (!m || !isNew) return false;
    const referrer = q.ownerOf.get(m[1])?.user_id;
    if (!referrer || referrer === uid) return false;
    return q.addRef.run(uid, referrer, now()).changes === 1;
  }

  const balanceNano = (uid) => BigInt(q.balance.get(String(uid)).n);

  /** Take up to `maxNano` of the user's credit for an order. Returns what was taken (BigInt). */
  function reserve(uid, orderId, maxNano) {
    const take = [balanceNano(uid), BigInt(maxNano)].reduce((a, b) => (a < b ? a : b));
    if (take <= 0n) return 0n;
    return q.add.run(String(uid), 'spend', -Number(take), 0, orderId, null, now()).changes === 1 ? take : 0n;
  }

  /** The order never went through: give back what it took. Safe to call more than once. */
  function release(orderId) {
    const spent = q.entry.get('spend', orderId);
    if (!spent) return 0n;
    return q.add.run(spent.user_id, 'release', -spent.amount_nano, 0, orderId, null, now()).changes === 1 ? BigInt(-spent.amount_nano) : 0n;
  }

  /**
   * A delivered order: if its buyer was referred, credit the referrer with `share` of our margin on it.
   * Returns { referrer, nano } when a reward was added, else null.
   */
  function reward(o) {
    if (!o || o.status !== 'delivered' || o.method !== 'gram') return null;
    const referrer = q.referrer.get(String(o.tg_user_id))?.referrer_id;
    if (!referrer || referrer === String(o.tg_user_id)) return null;
    // paid from a wallet the referrer uses too: that's the referrer buying for themselves
    const w = o.wallet && normalize(o.wallet);
    if (w && q.wallets.all(referrer).some((r) => normalize(r.wallet) === w)) return null;
    const gross = BigInt(o.gross_nano || o.amount_nano || 0);
    if (gross <= 0n) return null;
    // our margin on the order is gross × margin / (1 + margin); the referrer gets `share` of it
    const m = BigInt(Math.round(margin * 1e6)), sh = BigInt(Math.round(share * 1e6));
    let nano = (gross * m * sh) / ((1_000_000n + m) * 1_000_000n);
    let usd = Number(o.cost_usd || 0) * margin * share;
    // monthly cap per referrer
    const room = monthlyCapUsd - q.earnedUsdSince.get(referrer, now() - MONTH_MS).n;
    if (room <= 0) return null;
    if (usd > room) { nano = (nano * BigInt(Math.round((room / usd) * 1e6))) / 1_000_000n; usd = room; }
    if (nano <= 0n) return null;
    if (q.add.run(referrer, 'reward', Number(nano), usd, o.id, String(o.tg_user_id), now()).changes !== 1) return null;
    return { referrer, nano };
  }

  /** What the user sees on their dashboard. */
  function stats(uid) {
    uid = String(uid);
    return {
      code: codeFor(uid),
      invited: q.invited.get(uid).n,
      bought: q.bought.get(uid).n,
      earnedNano: String(q.earned.get(uid).n),
      balanceNano: balanceNano(uid).toString(),
      share,
    };
  }

  return { codeFor, claim, reserve, release, reward, stats, balanceNano, referrerOf: (uid) => q.referrer.get(String(uid))?.referrer_id ?? null };
}
