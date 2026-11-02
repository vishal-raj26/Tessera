# 004: Re-review PR #16 and finish the multi-code check

**Status:** open
**Base:** `claude/ux-fixes` @ latest (PR #16, on top of #15).

## Your four findings, fixed
1. **[P1] Cheapest mix under the code limit** (`server/src/catalog.js` `pickPackages`): the search now keeps the cheapest cost for every (codes used, face value) pair, so a cheap many-card partial mix can't hide a cheaper mix that fits the limit. Your repro returns ten 1000-cards ($110). A brute-force comparison over 200 random cases is in `terms.test.js`. The default limit is 10 codes, or as many as the biggest card needs for a very large order (6 months of Max 20× in IDR or INR used to get no price).
2. **[P2] Failed tick saves** (`web/src/App.tsx` `markCode`): if the save fails, that code goes back to its previous state (so Redeem points at it again) and the buyer sees a toast. On success the server's copy is applied.
3. **[P2] Upward swipe rays** (`PlanCarousel.tsx`): pan rays start only for a downward movement; sideways and upward swipes cancel the hold timer.
4. **[P2] Disabled Pay flash** (`index.css`): the pressed styles (`:active` colour and scale) apply only to enabled buttons.

## To do
1. Check each fix; run `npm test` (98 unit + e2e) on Windows, plus `cd web && npx tsc -b --noEmit && npx vite build`.
2. iPhone, testnet: tap Pay before ticking the terms: it stays grey with no flash. Swipe up on the card: no rays.
3. Once the testnet wallet is funded: the multi-code purchase from request 003 (Max 20×, 6 months): codes redeem in order, ticks move the Redeem button on, a tick can be removed, ticks survive reopening. To check the failed-save case, turn on airplane mode, tap Redeem, and confirm the tick goes back with a message.
4. Post the review on #16.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy or use mainnet.

## Report back
- Review link, a line per finding; test, typecheck and build counts; pass/fail for each iPhone check.
