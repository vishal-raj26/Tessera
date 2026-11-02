# 009: Re-review PR #17 (store validation, stockout invalidation)

**Status:** open
**Base:** `claude/supplier-pricing` @ latest (PR #17).

## Your two findings, fixed
1. **[P1] Store validation with an explicit product id** (`server/src/supplier/bitrefill.js` `toSnapshot`): every product detail, discovered or from `BITREFILL_PRODUCT_IDS`, must be the product asked for, a gift card matching the requested store's pattern, for the region's country and currency, and in stock. Your repro (`{"appstore:US":"google-play-usa"}`) is now refused, and the reverse mapping too.
2. **[P2] Stockouts drop cached cards** (`server/src/supplier/cache.js`): Bitrefill answers that mean "can't be sold" (in_stock false, 404, wrong product/store/country/currency, no matching product) throw `SupplierRefusal` (`authoritative: true`); the cache drops its cards at once. Timeouts and 5xx still keep the last good cards until `SUPPLIER_MAX_AGE_MIN`.

## Also, from Bitrefill's integration guidance (the page you linked)
- `purchase` checks availability right before buying: the product must be in stock and every package still listed with the same value; otherwise nothing is bought and the order fails to the admin.
- One order never buys from two products, and never more than 20 codes (Bitrefill's per-invoice limit); the picker is capped at 20.

## Evidence
- 5 regression tests in `server/test/pricing.test.js` (your P1 and P2 repros, 404/mismatch invalidation, pre-purchase check, 20-code cap). All 5 fail on `7f6caa7` and pass now.
- Linux: `npm test` 125 server + E2E OK + 6 web; `tsc` and `vite build` pass.

## To do
1. Review the fix commit on #17; rerun your two repros.
2. Windows: `npm test` (expect 125 server, E2E OK, 6 web), `cd web && npx tsc -b --noEmit && npx vite build`.
3. Still pending, when the owner can: the iPhone price check from 008 Part C, and the funded Pro 3-month purchase (request 007).
4. Post the review on #17.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy, use mainnet or spend real funds.

## Report back
- Review link with a line per finding; test, typecheck and build counts; pass/fail for any iPhone checks done.
