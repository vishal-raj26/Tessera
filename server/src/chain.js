// GRAM (TON) payment helpers: price feed, memo payload, and incoming-transfer detection.
import { beginCell, Address, Cell } from '@ton/core';

// GRAM/USD rate. `fresh` is when a live rate last arrived; quotes are refused once it's too old
// (RATE_MAX_AGE_MIN, default 10) so we never sell at a stale price. GRAM_USD_FALLBACK is only used
// in mock mode or before the first fetch when ALLOW_FALLBACK_RATE=1.
let rate = { usd: Number(process.env.GRAM_USD_FALLBACK || 1.5), fresh: 0, tried: 0 };
export const RATE_MAX_AGE_MS = Number(process.env.RATE_MAX_AGE_MIN || 10) * 60e3;

export async function refreshRate(fetchImpl = fetch) {
  if (Date.now() - rate.tried < 60_000) return rate;
  rate.tried = Date.now();
  try {
    const res = await fetchImpl(process.env.RATE_URL || 'https://tonapi.io/v2/rates?tokens=ton&currencies=usd', { signal: AbortSignal.timeout(4000) });
    const j = await res.json();
    const usd = Number((j?.rates?.TON ?? j?.rates?.GRAM)?.prices?.USD);
    if (usd > 0) rate = { usd, fresh: Date.now(), tried: rate.tried };
  } catch { /* keep the last rate; freshness tells callers how old it is */ }
  return rate;
}

/** USD per GRAM, or null when the rate is too old to sell at. */
export async function gramUsd({ allowStale = false } = {}) {
  const r = await refreshRate();
  if (allowStale) return r.usd;
  return Date.now() - r.fresh <= RATE_MAX_AGE_MS ? r.usd : null;
}
export const rateAgeMs = () => (rate.fresh ? Date.now() - rate.fresh : Infinity);
export function _setRateForTests(usd, fresh = Date.now()) { rate = { usd, fresh, tried: Date.now() }; }

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

/** Recent incoming transfers to the merchant wallet: [{ hash, comment, valueNano, source }] */
export async function recentIncoming(merchant, limit = 100) {
  const url = `${TONCENTER}/transactions?account=${encodeURIComponent(merchant)}&limit=${limit}&sort=desc`;
  const res = await fetch(url, {
    headers: process.env.TONCENTER_API_KEY ? { 'X-API-Key': process.env.TONCENTER_API_KEY } : {},
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) throw new Error(`toncenter ${res.status}`);
  const j = await res.json();
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
