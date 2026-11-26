# Codex / Claude handoff

## Latest: `main` @ 67f4020 (2026-11-03)

PRs #1–#17 are merged into `main` (#17 → #16 → #15 → `main`; #1–#14 were contained and are marked merged). `main`'s tree is identical to the reviewed and tested `25081bb`.

**What's on `main`**
- Multi-product catalog (Claude first), App Store and Google Play credit, GRAM (TON) and Telegram Stars payments, live GRAM rate, App Store price sync, 1/3/6/12-month terms (12 = the store's yearly price), testnet price scaling.
- 3D plan cards, pull-to-buy with rays (hold or downward pull only), clearly disabled Pay until the terms are accepted.
- Codes redeemed one at a time with saved ticks (`POST /api/orders/:id/codes/:index`, `web/src/markQueue.ts`).
- Pricing (`server/src/pricing.js`): in-app price → credit plus maximum sales tax (US 12%, CA 15%, `tax:<REGION>`) → the supplier's cards for exactly that store, country and currency → cheapest mix (ties: fewer codes, less leftover; at most 20 codes).
- Supplier cache (`server/src/supplier/cache.js`): 5-minute refresh, last good data for up to 30 minutes on outages, cards dropped at once on supplier refusals (refresh or purchase), generation checks so older refreshes can't restore them.
- Mock supplier: cards recorded from Bitrefill's public storefront on 2026-11-02 (US App Store, US Google Play, DE App Store; retail prices). Refuses mainnet with real payments.
- Bitrefill adapter: documented fields only; prices nothing until `BITREFILL_COST_FIELD` / `BITREFILL_COST_CURRENCY=USD` are set from a recorded response (`npm run supplier:record`); re-checks availability before each purchase.

**Verified:** `npm test` 131 server + E2E + 6 web (Linux and Windows), `tsc`, `vite build`. Testnet in Telegram: GRAM and Stars purchases delivered; on the final `main` code, a Pro 3-month GRAM purchase (0.68 test GRAM, memo `TS-B03C4D6FF7`) delivered 4 codes in ~8 s and the full redeem flow passed, with ticks kept after reopening (request 007); airplane-mode tick rollback, Pay/rays/toast checks on the owner's iPhone; Pro 1-month price ($22.40 needed, one $25 card).

**Not verified (open):**
- Bitrefill: pending credentials. Recording the real catalog and verifying the cost field and currency is request 013 (blocked until the owner has Business API credentials). After that: real availability and costs per region, range (custom amount) pricing, an invoice price check before paying.
- `npm audit`: 2 high (server, `@ton/ton` → `zod`; `@ton/ton` isn't imported by server code) and 3 low (web, `@tonconnect/ui` → `deepmerge`).
- Hosting and mainnet are separate, owner-authorised tasks.

## Earlier: `claude/payment-followups` (Claude)

- Base: `codex/payment-repair-handoff` (PR #1) merged with `codex/testnet-fixtures` (PR #4). Merge those two first; this PR's own diff is then just the follow-ups.
- **Real-payload tests** (`server/test/real-fixtures.test.js`): both readers accept Codex's captured fresh-wallet credit (`TS-628AF91308`, 0.209933333 GRAM). The stream payload has **no pre-decoded comment**, and the memo is decoded from the raw body. Both readers give the same hash, so the engine buys once.
- **Review finding 1 fixed:** a transfer to the merchant with a `TS-` memo that `isCreditedIncoming` rejects (missing field, active/frozen account, bounced back) now sends one admin alert, "Payment not recognised", deduped by tx hash in `settings`. It is never paid automatically. The stream only flags *finalized* rejections. Bounced messages, other accounts and memo-less transfers are ignored.
- Checks: 67 unit tests and `test:e2e` pass.
- Not covered by tests: the `flagRejected` dedupe in `index.js` (index.js isn't importable in tests).

## Earlier: `codex/payment-repair-handoff` (Codex)

- Branch: `codex/payment-repair-handoff`.
- Base: `87cbf3b` (`Add Telegram Stars checkout next to GRAM`). This branch preserves that work.
- Purpose: bring the previously tested GRAM payment repair into the GitHub source and establish shared agent instructions.

## Payment changes

- Share transfer classification between the TON stream and poller. Recognize a confirmed, non-bounceable credit to an uninitialized merchant wallet even when computation is skipped with `no_state`. Continue rejecting bounced transfers and other aborted transactions.
- Pay test-buyer forwarding fees separately so the merchant receives the exact quote. Stop the buyer if its wallet sequence number does not advance.
- Include regression tests and an optional paced buyer launcher for the public TON Center endpoint (`node scripts/testnet-buy-paced.cjs`).
- Preserve exact underpayment accounting, finalized-only GRAM fulfillment, transaction deduplication, and separation of GRAM and Stars orders.

## Verification

On the earlier ZIP-based local copy, Codex verified 52 unit tests, fake-chain integration, and both live testnet purchases: exact 0.2 GRAM and 0.12 + 0.08 GRAM top-up. Live delivery used the mock supplier and sample codes. These results do not validate Telegram Stars or real supplier fulfillment.

On this branch, `npm test` passed all 58 unit tests (including the new Stars tests) and the fake-chain integration test. `npx tsc -b --noEmit` and `npx vite build` passed. A separate reviewer found no actionable issues and independently passed the 26 new regression tests. No new live transfers were sent from this checkout; the live testnet evidence above belongs to the earlier local copy with the same GRAM repair.

Real wallet files, `.env`, and database history remain outside this checkout and are not included in Git. Existing npm audit reports two high-severity server findings and three low-severity web findings; dependency remediation is outside this sync and remains open.

## Working together

Use GitHub branches and pull requests as the shared record. Read this handoff and `AGENTS.md` at the start of a task, fetch current remote changes, and agree on ownership before touching the same files. Separate chats do not themselves constitute a handoff; record the relevant result here.

Next milestone after review and merge: exercise the Mini App through Telegram on testnet. Telegram Stars checkout needs its own verification. Supplier credentials and any production/mainnet switch require a separate authorized task.

## Local commands

Requires Node 22 or newer and installed dependencies (`npm run setup`). On this Windows machine the existing npm test command's POSIX environment syntax works with Git Bash as npm's script shell:

```powershell
$env:npm_config_script_shell='C:\Program Files\Git\bin\bash.exe'
npm test
```

For the frontend checks, run `npx tsc -b --noEmit` and `npx vite build` from `web`.
