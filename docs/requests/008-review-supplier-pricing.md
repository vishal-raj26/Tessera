# 008: Review the supplier pricing PR, and record Bitrefill's real catalog if credentials exist

**Status:** done (review posted 2026-11-02; fixes in 009)
**Base:** `claude/supplier-pricing` (PR on top of #16). Request 007 (multi-code purchase) still stands for #16.
**Why Codex:** reviewer role; and part B needs the owner's PC and `server/.env`.

## What changed
Pricing flow: plan + term + store + region → in-app price (yearly price for 12 months) → credit = price plus tax (US 12%, Canada 15%, else 0; `tax:<REGION>` setting) → the supplier's current cards for exactly that store, country and currency → cheapest mix (ties: fewer codes, then less leftover).
- `server/src/pricing.js`: `requiredCredit`, `usableCards` (refuses another store, country, currency, product, or data older than `SUPPLIER_MAX_AGE_MIN`), `pickPackages` (moved from `catalog.js`).
- `server/src/supplier/cache.js`: per store and region, refreshes every 5 min, keeps the last good data until it is 30 min old, retries failures after 60 s, shares one fetch between concurrent quotes; reported in `/healthz`.
- `server/src/supplier/mock.js`: cards recorded from Bitrefill's public storefront on 2026-11-02 (`recorded/…json`: US App Store $10–$500, US Google Play $5–$200, Germany App Store €5–€250; retail prices). No other store or region has cards in mock mode. The server refuses to start with the mock supplier on mainnet with real payments.
- `server/src/supplier/bitrefill.js`: uses only what the public docs confirm. The package cost field isn't documented, so nothing is priced until `BITREFILL_COST_FIELD` and `BITREFILL_COST_CURRENCY=USD` are set from a recorded response. Exactly one product must match store, country and currency (else `BITREFILL_PRODUCT_IDS`). Custom-amount ranges are ignored.
- `server/scripts/bitrefill-record.mjs` (`npm run supplier:record -- US`): read-only GETs; saves raw responses, prints each package's numeric fields.
- Tests: `test/pricing.test.js` (15) and `test/pricing-api.test.js` (7).

## Part A: review
1. Review the diff against `claude/ux-fixes`. Focus: no mixing of stores, countries or currencies; tax and rounding; the 12-month price; stale and failed supplier data never priced; brute-force agreement; that held quotes and payment safeguards are unchanged; anything in the Bitrefill adapter assumed beyond the public docs.
2. `npm test` on Windows (server 120 + e2e + web 6), `cd web && npx tsc -b --noEmit && npx vite build`.
3. Post findings on the PR, blocking first, with file, line and a failure case.

## Part B: record the real catalog (only if the owner has Bitrefill Business credentials)
1. If `server/.env` has `BITREFILL_API_ID` and `BITREFILL_API_SECRET`: `npm run supplier:record -- US`. It only reads; nothing is bought.
2. Report the printed product ids and each package's numeric fields (no credentials), and whether the products have a `range`.
3. Don't set `SUPPLIER=bitrefill`, don't buy anything, and don't commit the saved file; Claude will turn it into a fixture after review.
4. If there are no credentials, say so. That's the remaining dependency.

## Part C: testnet check
Restart `npm run live` on this branch. Prices now include 12% US tax and use the recorded cards, so they change slightly (Pro, 1 month: $22.40 needed → one $25 card). In Telegram, check the home prices and that Pro 1 month shows 1 code.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy, use mainnet or spend real funds.

## Report back
- Review link with a line per finding; test, typecheck and build counts; Part B output or "no credentials"; Part C pass/fail.
