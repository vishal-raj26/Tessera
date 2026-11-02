# 002: Review PR #15, then run a full testnet purchase in Telegram

**Status:** open
**Base:** `claude/multi-product` @ latest (PR #15). It contains every change since `main` (PRs #1–#14 are stacked into it).
**Why Codex:** part A is the reviewer role (AGENTS.md › Roles); part B needs the owner's PC, `.env`, testnet wallets, `cloudflared` and Telegram.

## Goal
1. An independent review of everything on PR #15 before the owner merges it into `main`.
2. Proof that the current code works end to end in Telegram on testnet: GRAM and Stars purchases, live prices, and the new screens.

## Part A: review PR #15
1. Read `AGENTS.md` (Product direction, Roles, Rules) and `docs/HANDOFF.md`.
2. Review the diff `main...claude/multi-product`, focusing on:
   - **Payments:** GRAM orders paid only on finalized transfers, each tx hash and Stars charge id applied once, GRAM never pays a Stars order, underpayment and top-ups, held quotes (`/api/quotes`) used only by the same buyer, plan, term, store and region.
   - **Prices:** App Store sync (`server/src/applePrices.js`), Stars floor (never below cost), testnet scaling (`TEST_PRICE_SCALE`, Stars included), store-aware prices (`/price play …`).
   - **Multi-product:** no Claude-only assumptions left in server or app text; `store` stored on orders (migration).
   - **App:** nothing that breaks on Telegram iOS/Android webviews (3D cards fall back to CSS without WebGL).
3. Run `npm test` (server: unit + e2e) and `cd web && npx tsc -b --noEmit && npx vite build`.
4. Post findings as a PR review on #15: blocking issues first, each with file, line and a concrete failure case. Don't push fixes; Claude implements them.

## Part B: live testnet run (after part A)
1. Stop any running `npm run live`. If port 8787 is busy: `netstat -ano | findstr :8787`, then `taskkill /PID <pid> /F`.
2. `git checkout claude/multi-product`, `git pull`, `npm run live` (testnet, `PAYMENT_MODE=chain`, mock supplier, `TEST_PRICE_SCALE=0.01`).
3. Open `<public url>/healthz`: `gram.source` should be a live source (not `fallback`) with `ageSec` under ~30.
4. The owner, in Telegram on their iPhone:
   - Home: 3D cards load; swiping, the term picker (1/3/6 months, 1 year on Pro), pull-to-buy with rays all work; no card shows through another.
   - The price line reads "Test price 1% · ≈ $…".
   - **GRAM purchase:** Pro, 1 month, paid from the testnet wallet. It should go: payment seen → confirmed → code revealed → shows in Your codes.
   - **Stars purchase:** Pro, 1 month, about 18 Stars on testnet. Complete it (it's real Stars, ~$0.36). It should be delivered the same way.
   - `/prices` in the admin bot shows the App Store prices with their source, and the live GRAM rate.
5. Optional: if the owner wants to see the Android switch, set one Play price (`/price play pro_m 19.99`), reopen the app, and check the iPhone/Android switch and "Google Play credit for Claude". There's no command to remove a Play price yet, so only do this if the owner is fine with Android buyers on testnet seeing Pro.

## Don't
- Commit or paste secrets (`server/.env`, wallet phrases, bot token, API keys), here or anywhere in the repo.
- Change app code. Report what's wrong instead.
- Merge, deploy, or use mainnet.

## Done when
- A review is posted on PR #15.
- Each check in part B is reported pass/fail.

## Report back
- Link to the review, with a one-line summary per finding.
- Test, typecheck and build results (counts, pass/fail).
- `/healthz` `gram` object (no secrets).
- Part B: each check pass/fail; for the two purchases, the order memo, status sequence, and for GRAM the tx hash; exact error text for any failure.
