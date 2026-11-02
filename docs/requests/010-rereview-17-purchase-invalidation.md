# 010: Re-review PR #17 (refused purchases drop cached cards)

**Status:** open
**Base:** `claude/supplier-pricing` @ latest (PR #17).

## Your finding, fixed
**[P2] Invalidate cached cards when a purchase is refused** (`server/src/supplier/cache.js` `purchase`): the cache now wraps `purchase`. On an authoritative refusal (`SupplierRefusal`), every cached snapshot of the refused product is dropped, the error is recorded (`purchase refused: …`), and the entry is refetched after `retryMs`. The error is rethrown, so the order still fails to the admin as before. Other products' snapshots are untouched. Transient failures (network, 5xx, `balance_too_low`) leave the cache alone.

Also: an invoice answered with Bitrefill's documented `out_of_stock` or `not_found` error code is now a `SupplierRefusal` too (`server/src/supplier/bitrefill.js` `call`), so it invalidates in the same way.

## Evidence
- 3 regression tests at the end of `server/test/pricing.test.js`:
  - your repro (pre-check refusal, then `snapshot` returns null, fresh false, cards 0);
  - an `out_of_stock` invoice answer;
  - transient failures keep the cards.
- The first two fail on bbee8f1 and pass now.
- Linux: `npm test` 128 server + E2E OK + 6 web; `tsc` and `vite build` pass.

## To do
1. Review the fix commit on #17 and rerun your exact-module repro.
2. Windows: `npm test` (expect 128 server, E2E OK, 6 web), `cd web && npx tsc -b --noEmit && npx vite build`.
3. Still pending at the owner's choice: the funded Pro 3-month purchase (wallet below the ~0.67 test GRAM quote). Bitrefill credentials remain a dependency.
4. Post the review on #17.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy, use mainnet or spend real funds.

## Report back
- Review link with a line per finding; test, typecheck and build counts.
