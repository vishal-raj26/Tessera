// Real-time payment detection over the TON Center Streaming API (SSE, v2).
// https://docs.ton.org/api/streaming/overview
//  - "pending" (emulated) transfers are used only to tell the buyer "payment seen";
//  - an order is paid and fulfilled only on "finalized" (committed in the masterchain).
// The stream doesn't replay missed events, so the regular poller stays on as a backstop.
import { NETWORK, readComment, isCreditedIncoming, unrecognisedCredit } from './chain.js';

const SSE_URL = process.env.TON_STREAM_URL
  || (NETWORK === 'testnet' ? 'https://testnet.toncenter.com/api/streaming/v2/sse' : 'https://toncenter.com/api/streaming/v2/sse');

/** Pull incoming transfers to `merchant` out of a streaming "transactions" notification. */
export function transfersFromNotification(n, merchant, onRejected = null) {
  if (n?.type !== 'transactions' || !Array.isArray(n.transactions)) return [];
  // only finalized transactions are worth a person's attention; pending ones may still change
  if (onRejected && n.finality === 'finalized') {
    for (const t of n.transactions) { const r = unrecognisedCredit(t, merchant); if (r) onRejected(r); }
  }
  return n.transactions
    .filter((t) => isCreditedIncoming(t, merchant))
    .map((t) => ({
      hash: t.hash,
      comment: readComment(t.in_msg.message_content),
      valueNano: BigInt(t.in_msg.value || 0),
      source: t.in_msg.source,
      finality: n.finality,
    }))
    .filter((t) => t.valueNano > 0n);
}

/** Minimal SSE reader over fetch: yields parsed JSON from `data:` lines. */
async function* sse(res) {
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n\n')) >= 0) {
      const chunk = buf.slice(0, i);
      buf = buf.slice(i + 2);
      const data = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('\n');
      if (!data) continue; // keepalive comments (": keepalive") and empty events
      try { yield JSON.parse(data); } catch { /* ignore malformed */ }
    }
  }
}

export function startPaymentStream({ merchant, onPending, onFinal, onRejected = null, onState = () => {}, log = console }) {
  const key = process.env.TONCENTER_API_KEY;
  let stopped = false;
  let backoff = 2000;
  (async function run() {
    while (!stopped) {
      try {
        const url = key ? `${SSE_URL}?api_key=${encodeURIComponent(key)}` : SSE_URL;
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', accept: 'text/event-stream', ...(key && { 'X-API-Key': key }) },
          body: JSON.stringify({ types: ['transactions'], addresses: [merchant], min_finality: 'pending' }),
        });
        if (!res.ok || !res.body) throw new Error(`stream HTTP ${res.status}`);
        log.log?.(`[stream] connected (${NETWORK})`);
        onState(true);
        backoff = 2000;
        for await (const n of sse(res)) {
          if (stopped) return;
          for (const t of transfersFromNotification(n, merchant, onRejected)) {
            if (t.finality === 'finalized') await onFinal(t);
            else onPending(t);
          }
        }
        throw new Error('stream closed');
      } catch (e) {
        onState(false);
        if (stopped) return;
        log.warn?.(`[stream] ${e.message}; reconnecting in ${Math.round(backoff / 1000)}s`);
        await new Promise((r) => setTimeout(r, backoff));
        backoff = Math.min(backoff * 2, 60_000); // the API answers 429 to fast reconnects
      }
    }
  })();
  return { stop: () => { stopped = true; } };
}
