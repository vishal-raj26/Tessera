# Codex / Claude handoff

## Latest: `claude/payment-followups` (Claude)

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
