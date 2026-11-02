// Keeps each supplier snapshot (one store, country and currency) fresh enough to price against.
// - A snapshot is refetched after ttlMs.
// - If a refetch fails, the last good snapshot is still used until it's maxAgeMs old; after that the
//   store/region has no price (pricing.js refuses stale data), never an old price.
// - Failures are retried after retryMs, not on every request.
// status() reports every snapshot's age, source and last error for /healthz and the admin.

export function cachedSupplier(supplier, { ttlMs = 5 * 60e3, maxAgeMs = 30 * 60e3, retryMs = 60e3, now = Date.now, log = console } = {}) {
  const entries = new Map(); // `${store}:${region}` -> { snap, error, triedAt, inflight }

  async function refresh(key, region, store) {
    const e = entries.get(key) || {};
    entries.set(key, e);
    if (e.inflight) return e.inflight;
    e.inflight = (async () => {
      e.triedAt = now();
      try {
        const snap = await supplier.fetchSnapshot(region, store);
        e.snap = snap;
        e.error = null;
      } catch (err) {
        e.error = String(err?.message ?? err);
        log.warn?.(`[supplier] ${supplier.name} ${store} ${region}: ${e.error}`);
      } finally {
        e.inflight = null;
      }
    })();
    return e.inflight;
  }

  return {
    name: supplier.name,
    live: supplier.live,
    maxAgeMs,
    /** Latest snapshot for a store and region (possibly being refreshed), or null. */
    async snapshot(region, store = 'appstore') {
      const key = `${store}:${region}`;
      const e = entries.get(key);
      const age = e?.snap ? now() - e.snap.fetchedAt : Infinity;
      const usable = age <= maxAgeMs;
      // a fetch already running: callers without usable data wait for it (concurrent quotes share it)
      if (e?.inflight) { if (!usable) await e.inflight; }
      else if (age >= ttlMs && (!e?.triedAt || now() - e.triedAt >= retryMs)) {
        // nothing usable yet: wait for it; otherwise refresh in the background and use what we have
        if (!usable) await refresh(key, region, store);
        else refresh(key, region, store);
      }
      return entries.get(key)?.snap ?? null;
    },
    purchase: (args) => supplier.purchase(args),
    status() {
      const t = now();
      return [...entries].map(([key, e]) => ({
        key,
        source: e.snap?.source ?? null,
        live: e.snap?.live ?? supplier.live,
        cards: e.snap?.packages?.length ?? 0,
        ageSec: e.snap ? Math.round((t - e.snap.fetchedAt) / 1000) : null,
        fresh: !!e.snap && t - e.snap.fetchedAt <= maxAgeMs,
        error: e.error ?? null,
      }));
    },
  };
}
