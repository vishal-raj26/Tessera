# 013: Record Bitrefill's real catalog and verify the cost field

**Status:** blocked: waiting for Bitrefill Business API credentials. Don't start until the owner says the credentials are in `server/.env`; the owner then changes this to `open`.
**Base:** `main` (after PR #18).
**Why Codex:** needs the owner's PC and `server/.env`. Credentials never leave that file.

## Why
Real supplier pricing is off. Bitrefill's public docs don't say which package field is our cost or its currency, so the adapter prices nothing until that is verified from a real authenticated response (`server/src/supplier/bitrefill.js`).

## To do (once unblocked)
1. On `main`, with `BITREFILL_API_ID` and `BITREFILL_API_SECRET` in `server/.env` (and `SUPPLIER` still `mock`): `npm run supplier:record -- US`. It sends GET requests only; nothing is bought.
2. Report, without credentials:
   - the product ids found for App Store and Google Play US, and any "several products" or "no product" message;
   - each package's printed numeric fields;
   - whether the products have a `range` (custom amount), and its min/max/step;
   - the path of the saved file (`server/test/fixtures/bitrefill/api-<date>.json`).
3. Don't set `BITREFILL_COST_FIELD`, `BITREFILL_COST_CURRENCY` or `SUPPLIER=bitrefill`, and don't commit the saved file. Claude will review it, choose the cost field with the owner, and turn it into a fixture and tests.

## Still open after this
Real availability and costs for other regions, range pricing, an invoice price check before paying, and a test-product purchase before any real one: each a separate, owner-authorised task.

## Don't
- Commit or paste secrets. Change app code. Buy anything. Merge, deploy or use mainnet.
