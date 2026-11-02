// GRAM (TON) payment helpers: price feed, memo payload, and incoming-transfer detection.
import { beginCell, Address, Cell } from '@ton/core';

// GRAM/USD rate. Refreshed in the background every 30s (startRateFeed) from several public sources
// in turn, so a quote never waits for it and never mixes an old and a new rate. `fresh` is when a live
// rate last arrived: on mainnet, quotes are refused once it's older than RATE_MAX_AGE_MIN (default 10).
// GRAM_USD_FALLBACK is only used in demo/testnet before (or while) no live rate is available.
let rate = { usd: Number(process.env.GRAM_USD_FALLBACK || 1.5), fresh: 0, tried: 0, source: 'fallback', error: null };
export const RATE_MAX_AGE_MS = Number(process.env.RATE_MAX_AGE_MIN || 10) * 60e3;

const UA = { 'user-agent': 'Mozilla/5.0 (compatible; Tessera/1.0; +https://github.com/vishal-raj26/Tessera)', accept: 'application/json' };
const pick = (j) => Number((j?.rates?.TON ?? j?.rates?.GRAM ?? j?.rates?.ton ?? j?.rates?.gram)?.prices?.USD);
// GRAM was called Toncoin (TON) until June 2026; exchanges and APIs may list it either way.
export const RATE_SOURCES = [
  ...(process.env.RATE_URL ? [{ name: 'custom', url: process.env.RATE_URL, read: pick }] : []),
  { name: 'tonapi', url: 'https://tonapi.io/v2/rates?tokens=ton&currencies=usd', read: pick },
  { name: 'tonapi-gram', url: 'https://tonapi.io/v2/rates?tokens=gram&currencies=usd', read: pick },
  { name: 'binance', url: 'https://api.binance.com/api/v3/ticker/price?symbol=TONUSDT', read: (j) => Number(j?.price) },
  { name: 'bybit', url: 'https://api.bybit.com/v5/market/tickers?category=spot&symbol=TONUSDT', read: (j) => Number(j?.result?.list?.[0]?.lastPrice) },
];

let inflight = null;
/** Fetch a live rate now (first source that answers wins). Concurrent callers share one request. */
export function refreshRate(fetchImpl = fetch, { sources = RATE_SOURCES, log = console } = {}) {
  if (inflight) return inflight;
  if (Date.now() - rate.tried < 25_000) return Promise.resolve(rate);
  rate.tried = Date.now();
  inflight = (async () => {
    const errors = [];
    for (const src of sources) {
      try {
        const res = await fetchImpl(src.url, { headers: UA, signal: AbortSignal.timeout(5000) });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const usd = src.read(await res.json());
        if (!(usd > 0 && usd < 1000)) throw new Error('no price in the answer');
        if (rate.source !== src.name || rate.error) log.log?.(`[rate] live GRAM price $${usd.toFixed(4)} from ${src.name}`);
        rate = { usd, fresh: Date.now(), tried: rate.tried, source: src.name, error: null };
        return rate;
      } catch (e) {
        errors.push(`${src.name}: ${e.message}`);
      }
    }
    const error = errors.join('; ');
    if (error !== rate.error) log.warn?.(`[rate] live GRAM price unavailable (${error}). Still using $${rate.usd} from ${rate.source}${rate.fresh ? `, ${Math.round((Date.now() - rate.fresh) / 1000)}s old` : ''}.`);
    rate = { ...rate, error };
    return rate;
  })().finally(() => { inflight = null; });
  return inflight;
}

/** Keep the rate fresh in the background from startup. */
export function startRateFeed(everyMs = 30_000) {
  refreshRate();
  const t = setInterval(() => refreshRate(), everyMs);
  t.unref?.();
  return () => clearInterval(t);
}

/** USD per GRAM (the latest rate; never waits on the network), or null when too old to sell at. */
export async function gramUsd({ allowStale = false } = {}) {
  if (!rate.fresh && !rate.tried) await refreshRate(); // very first quote: wait once for a live rate
  if (allowStale) return rate.usd;
  return Date.now() - rate.fresh <= RATE_MAX_AGE_MS ? rate.usd : null;
}
/** For /healthz and the admin bot. */
export const rateStatus = () => ({ usd: rate.usd, source: rate.source, ageSec: rate.fresh ? Math.round((Date.now() - rate.fresh) / 1000) : null, error: rate.error });
export const rateAgeMs = () => (rate.fresh ? Date.now() - rate.fresh : Infinity);
export function _setRateForTests(usd, fresh = Date.now()) { rate = { usd, fresh, tried: Date.now(), source: 'test', error: null }; }

/** Base64 BOC of a text-comment body, for TON Connect sendTransaction payload. */
export function commentPayload(text) {
  return beginCell().storeUint(0, 32).storeStringTail(text).endCell().toBoc().toString('base64');
}

export function normalize(addr) {
  try { return Address.parse(addr).toRawString(); } catch { return null; }
}

/** User-friendly, non-bounceable form for TON Connect (testnet addresses get the test flag). */
export function friendly(addr, network) {
  return Address.parse(addr).toString({ urlSafe: true, bounceable: false, testOnly: network === 'testnet' });
}

/** Text comment from a toncenter message: use the decoded comment, or decode the body ourselves. */
export function readComment(content) {
  const d = content?.decoded;
  if (d && typeof d.comment === 'string') return d.comment;
  if (!content?.body) return null;
  try {
    const sl = Cell.fromBase64(content.body).beginParse();
    if (sl.remainingBits < 32 || sl.loadUint(32) !== 0) return null;
    return sl.loadStringTail();
  } catch { return null; }
}

export const NETWORK = process.env.TON_NETWORK === 'testnet' ? 'testnet' : 'mainnet';
const TONCENTER = process.env.TONCENTER_URL || (NETWORK === 'testnet' ? 'https://testnet.toncenter.com/api/v3' : 'https://toncenter.com/api/v3');

/** A fresh wallet can retain a non-bounceable credit despite skipping execution. */
export function isCreditedIncoming(t, merchant) {
  const m = t.in_msg;
  const expected = normalize(merchant);
  if (!expected || !m?.source || m.bounced) return false;
  const destinations = [t.account, m.destination].filter(a => a != null);
  if (!destinations.length || destinations.some(a => normalize(a) !== expected)) return false;
  const d = t.description;
  if (!d?.aborted) return true;
  try {
    return d.type === 'ord' && d.destroyed === false && d.credit_first === true
      && t.end_status === 'uninit' && m.bounce === false && m.bounced === false
      && !d.bounce && d.compute_ph?.skipped === true && d.compute_ph.reason === 'no_state'
      && BigInt(d.credit_ph?.credit ?? 0) > 0n
      && BigInt(d.credit_ph.credit) === BigInt(m.value);
  } catch { return false; }
}

/**
 * A transfer to the merchant that carries an order memo but that isCreditedIncoming rejected.
 * Never paid automatically; returned so a person is told instead of it vanishing silently.
 */
export function unrecognisedCredit(t, merchant) {
  const m = t?.in_msg;
  const expected = normalize(merchant);
  if (!expected || !m?.source || m.bounced || isCreditedIncoming(t, merchant)) return null;
  if ([t.account, m.destination].some((a) => a != null && normalize(a) !== expected)) return null;
  const comment = readComment(m.message_content)?.trim();
  let valueNano = 0n;
  try { valueNano = BigInt(m.value || 0); } catch { /* malformed */ }
  if (!comment?.startsWith('TS-') || valueNano <= 0n) return null;
  return {
    hash: t.hash, comment, valueNano, source: m.source,
    reason: t.description?.bounce ? 'bounced back to the sender' : 'not recognised as a completed credit',
  };
}

/** Recent incoming transfers to the merchant wallet: [{ hash, comment, valueNano, source }] */
export async function recentIncoming(merchant, limit = 100, onRejected = null) {
  const url = `${TONCENTER}/transactions?account=${encodeURIComponent(merchant)}&limit=${limit}&sort=desc`;
  const res = await fetch(url, {
    headers: process.env.TONCENTER_API_KEY ? { 'X-API-Key': process.env.TONCENTER_API_KEY } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`toncenter ${res.status}`);
  const j = await res.json();
  if (onRejected) for (const t of j.transactions || []) { const r = unrecognisedCredit(t, merchant); if (r) onRejected(r); }
  return (j.transactions || [])
    .filter((t) => isCreditedIncoming(t, merchant))
    .map((t) => ({
      hash: t.hash,
      comment: readComment(t.in_msg.message_content),
      valueNano: BigInt(t.in_msg.value || 0),
      source: t.in_msg.source,
      bounced: !!t.in_msg.bounced,
    }))
    .filter((t) => !t.bounced && t.valueNano > 0n);
}
