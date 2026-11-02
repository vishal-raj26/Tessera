# 015: Re-review PR #19 (Renew, opening, balance, Reduce Motion)

**Status:** open
**Base:** `claude/home-polish` @ latest (PR #19).

## Your four findings, fixed
1. **[P1] Renew opens exactly the last purchase or nothing** (`web/src/renew.ts`, `App.tsx` renew):
   - The target keeps app, store, plan and term. If the store differs, the app loads that store's own catalog. The app now records which store's prices are loaded (`catalogStore`, from the catalog response), and nothing opens until it's the target's.
   - It opens only when the plan is available and has exactly that term. Otherwise it shows "That plan can't be renewed here right now", opens nothing, and reloads the current store's prices.
   - Your repro (App Store Pro 12 m while the Play catalog is loaded) now waits, then opens App Store 12 m, or fails if 12 m is missing.
2. **[P2] The opening plays after onboarding:** the once-per-session decision is made when the first carousel actually mounts (`PlanCarousel` initializer → `shouldPlayMosaic`). The app offers it only until a carousel is shown (`onShown`), so a store or app switch still never replays it. The decision is memoised per page load (StrictMode-safe), and the rule itself is in `web/src/opening.ts`.
3. **[P2] The balance belongs to its wallet:** stored as `{ address, gram }` and shown only for the same address (`web/src/balance.ts shownBalance`). After switching wallets, or when the new request fails, the pill shows the new wallet's short address, never the old funds.
4. **[P2] Reduce Motion:** `<MotionConfig reducedMotion="user">` in `main.tsx` turns Framer Motion movement into fades app-wide. The plan line also uses `useReducedMotion` (no slide, a shorter fade).

## Evidence
- New web tests:
  - `test/renew.test.ts` (4): your repro, exact term, unpriced store / other app / missing / unavailable plan, waiting;
  - `test/opening-and-balance.test.ts` (2).
- Root `npm test`: 133 server + E2E OK + 18 web; `tsc` and `vite build` pass.
- Headless Chromium on the real app:
  - a new buyer sees the opening after onboarding, and it doesn't replay after a reload;
  - with `reducedMotion: 'reduce'`, no opening and the plan line has no transform during a change;
  - with normal motion it still slides.

## To do
1. Review the fix commit; rerun your extracted Renew repro against `renewStep`.
2. Windows: `npm test` (expect 133 server, E2E OK, 18 web), `cd web && npx tsc -b --noEmit && npx vite build`.
3. Restart `npm run live` on this branch. The owner's iPhone checks from request 014 are still pending: visuals, Renew (don't pay), balance, Reduce Motion.
4. Post the review on PR #19.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy, use mainnet or spend real funds.

## Report back
- Review link with a line per finding; test, typecheck and build counts; pass/fail per iPhone check.
