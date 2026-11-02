# 012: Move the local setup to `main` and review the handoff update

**Status:** done (2026-11-03: handoff review clean; local setup on `main` @ 67f4020; tests 131 + E2E + 6 web; /healthz gram from tonapi, supplier appstore:US fresh from the recorded fixture)
**Base:** `claude/post-merge-handoff` (docs-only PR on top of `main` @ 67f4020).

## Context
PRs #1–#17 are merged; `main`'s tree is identical to the reviewed `25081bb`. The task branches are no longer needed for running the app.

## To do
1. Review the handoff PR (`docs/HANDOFF.md` "Latest" section, request statuses). Post findings on the PR.
2. On the owner's PC: stop `npm run live`, `git checkout main`, `git pull`. Keep any local, uncommitted lockfile changes you mentioned only if they're needed; report what they were (don't commit them).
3. `npm ci` in `server/` and `web/` if `node_modules` is out of date, then `npm test` (expect 131 server, E2E OK, 6 web) and `cd web && npx tsc -b --noEmit && npx vite build`.
4. `npm run live` from `main` (testnet, mock supplier, `TEST_PRICE_SCALE=0.01`). Check `/healthz`: `gram.source` live, and `supplier.snapshots` shows `appstore:US` with source `fixture:bitrefill-storefront-2026-11-02` and `fresh: true`.
5. Request 007 (funded Pro 3-month purchase) stays pending until the owner adds test GRAM.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy, use mainnet or spend real funds.

## Report back
- Review link; test, typecheck and build counts; `/healthz` `gram` and `supplier` objects (no secrets); what the local lockfile changes were.
