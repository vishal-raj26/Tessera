# 005: Re-review PR #16 (overlapping tick saves)

**Status:** open
**Base:** `claude/ux-fixes` @ latest (PR #16).

## The fix
Your P2 on `web/src/App.tsx` (overlapping saves for one code). Saving moved into `web/src/markQueue.ts`:
- Only one save per code is in flight. Taps made meanwhile only change what we want; when the save returns, it sends again only if that still differs from the server's answer.
- The screen always ends on the server's value: on success, the value the server returned; on failure, the value it last confirmed (nothing more is sent, and a toast asks to tap again).
- Different codes save independently.

Regression tests: `web/test/markQueue.test.ts` (6 tests, Node's built-in TypeScript stripping), including both of your cases: a late reply to the older save, and two failed saves while offline. Root `npm test` now runs server unit, e2e, then web tests.

## To do
1. Check the fix, and try your extracted-function repro against `createMarkQueue`.
2. On Windows: `npm test` (98 server + e2e + 6 web), `cd web && npx tsc -b --noEmit && npx vite build`.
3. Still pending from 004, when the owner is ready: iPhone checks (Pay stays grey when tapped, no rays on upward swipe), the multi-code purchase, and airplane mode on Redeem (the tick comes back off with a message).
4. Post the review on #16.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy or use mainnet.

## Report back
- Review link, a line per finding; test, typecheck and build counts; pass/fail for each iPhone check.
