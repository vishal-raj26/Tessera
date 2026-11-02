# 003: Re-review PR #15, then review the redeem and pricing PR

**Status:** done (PR #16 review posted 2026-11-02; multi-code Telegram check moved to 004)
**Why Codex:** reviewer role (AGENTS.md › Roles), plus the owner's PC for the Windows test run and Telegram.

## Part A: re-review PR #15 (`claude/multi-product`)
Your four findings were fixed in `43f7d92`:
1. `/api/quotes` always prices fresh; an old quote is never renewed.
2. The app ignores late quote responses; Pay needs a quote matching the shown plan, term and store.
3. `multi-product.test.js` closes its seed DB and waits for the server to exit before deleting the temp folder.
4. Test servers never read `server/.env` (`server/test/isolated-env.js`); testnet scaling has its own test (`testnet-scale.test.js`).

Check each fix, run `npm test` on Windows (this was 92/94 before), plus `cd web && npx tsc -b --noEmit && npx vite build`. Approve or post new findings on #15.

## Part B: review the follow-up PR (`claude/ux-fixes`, based on `claude/multi-product`)
- **Cheapest card mix:** `pickPackages` (`server/src/catalog.js`) is now an exact min-cost search over the region's denominations; ties go to fewer codes. Check it can't pick a mix costing more than another valid mix, and that it stays fast for big-number currencies (IDR, INR).
- **Redeem one at a time:** `POST /api/orders/:id/codes/:index` ticks or unticks a code. Only the owner, only delivered orders, only real indexes; the code itself never changes.
- **App:** the Pay button looks switched off until the terms box is ticked; cards no longer move by themselves (no idle sway, no gyro); rays only start on a hold or a downward pull, never on a sideways swipe; codes are listed in order, the next one is highlighted, and Redeem copies it, opens the store and ticks it.

Run the same tests. Then, with `npm run live` on testnet, in Telegram on the iPhone:
1. Home: cards stay still until touched; swiping sideways shows no rays; holding still or pulling down does.
2. Review sheet: Pay is grey and inactive until the box is ticked.
3. Buy a plan that needs more than one code (e.g. Max 20× for 6 months, GRAM on testnet). In the done screen and in Your codes: Redeem copies code 1, opens the App Store and ticks it; the button moves on to code 2; tapping a tick removes it; ticks survive reopening the app. The mock codes won't redeem, which is expected.

Post findings on the PR, blocking first, with file, line and a failure case.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy or use mainnet.

## Report back
- Review links with a line per finding; test, typecheck and build counts; pass/fail for each Telegram check.
