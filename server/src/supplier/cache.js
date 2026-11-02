// Keeps each supplier snapshot (one store, country and currency) fresh enough to price against.
// - A snapshot is refetched after ttlMs.
// - If a refetch fails (timeout, server error), the last good snapshot is still used until it's maxAgeMs
//   old; after that the store/region has no price (pricing.js refuses stale data), never an old price.
// - If the supplier answers that the cards can't be sold (an error with authoritative: true, e.g. out of
//   stock), the cached cards are dropped at once. The same happens when a purchase is refused that way.
// - Failures are retried after retryMs, not on every request.
// status() reports every snapshot's age, source and last error for /healthz and the admin.

export function cachedSupplier(supplier, { ttlMs = 5 * 60e3, maxAgeMs = 30 * 60e3, retryMs = 60e3, now = Date.now, log = console } = {}) {
  // `${store}:${region}` -> { snap, error, triedAt, inflight, gen }. `gen` goes up whenever cards are
  // dropped; a refresh started before that finishes into nothing, so an older answer can never bring
  // back cards the supplier has since refused.
  const entries = new Map();
  // productId -> when the supplier last refused it: a fetch of that product started earlier is ignored,
  // even for an entry that had no cards yet when the refusal came (so its product wasn't known)
  const refusedAt = new Map();

  async function refresh(key, region, store) {
    const e = entries.get(key) || { gen: 0 };
    entries.set(key, e);
    if (e.inflight) return e.inflight;
    const gen = e.gen;
    const startedAt = now();
    const run = (async () => {
      e.triedAt = startedAt;
      try {
        const snap = await supplier.fetchSnapshot(region, store);
        if (e.gen !== gen) return; // cards were dropped while this was in flight: ignore it
        if ((refusedAt.get(snap?.productId) ?? -Infinity) >= startedAt) return; // its product was refused since
        e.snap = snap;
        e.error = null;
      } catch (err) {
        if (e.gen !== gen) return;
        e.error = String(err?.message ?? err);
        // The supplier answered that these cards can't be sold (out of stock, gone, wrong product): drop the
        // cached cards now. A timeout or server error keeps them until maxAgeMs.
        if (err?.authoritative) drop(e);
        log.warn?.(`[supplier] ${supplier.name} ${store} ${region}: ${e.error}`);
      } finally {
        if (e.inflight === run) e.inflight = null;
      }
    })();
    e.inflight = run;
    return run;
  }

  /** Drop an entry's cards and disown any refresh already running for it. */
  function drop(e) {
    e.snap = null;
    e.gen += 1;
    e.inflight = null;
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
    /**
     * Buy through the supplier. If it refuses because the cards can't be sold (authoritative, e.g. the
     * pre-purchase check finds a card gone, or the invoice says out_of_stock), every cached snapshot of
     * that product is dropped at once so no one else is quoted those cards; the error is recorded and
     * rethrown. Transient failures (timeouts, 5xx) leave the cache alone.
     */
    async purchase(args) {
      try {
        return await supplier.purchase(args);
      } catch (err) {
        if (err?.authoritative) {
          const products = new Set((args?.packages || []).map((p) => p.productId));
          for (const id of products) refusedAt.set(id, now());
          for (const [key, e] of entries) {
            if (e.snap && products.has(e.snap.productId)) {
              drop(e); // also disowns a refresh that started before this refusal
              e.error = `purchase refused: ${String(err?.message ?? err)}`;
              e.triedAt = now(); // refetched after retryMs, like any other failure
              log.warn?.(`[supplier] ${supplier.name} ${key}: cards dropped (${e.error})`);
            }
          }
        }
        throw err;
      }
    },
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
