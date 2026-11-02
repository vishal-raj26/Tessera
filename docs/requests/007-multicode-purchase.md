# 007: Multi-code purchase on testnet (before merging #16 → #15 → main)

**Status:** open
**Base:** `main` (everything is merged; was PR #16). Pending at the owner's choice until the wallet has ~0.67 test GRAM.
**Why Codex:** needs the owner's PC, testnet wallet and Telegram.

## Why this is affordable now
The six-month Max 20× buy needed ~15 test GRAM. With the cheapest-mix picker, smaller plans also split into several codes. At `TEST_PRICE_SCALE=0.01` (mock supplier, US), at a GRAM rate of ~$1.50:

| Plan | Codes | GRAM | Stars |
|---|---|---|---|
| Pro, 1 month | 2 | ~0.17 | 18 |
| **Pro, 3 months** | **4** | **~0.5** | 54 |
| Max 20×, 1 month | 2 | ~2.0 | 223 |

At the live rate (~$1.20) Pro 3 months is ~0.6 GRAM, which fits the wallet's ~1.04. Check the price shown in the app before paying.

## To do
1. Make sure `npm run live` runs the latest `main` (testnet, `PAYMENT_MODE=chain`, mock supplier, `TEST_PRICE_SCALE=0.01`).
2. In Telegram on the owner's iPhone, buy **Pro, 3 months** with GRAM from the testnet wallet. The review sheet should say "4 codes" (or however many the app shows; note it).
3. Expected flow: payment seen → confirmed → codes revealed. On the done screen:
   - codes are numbered, code 1 is highlighted, the button reads "Redeem code 1 in App Store";
   - tapping it copies code 1, opens the App Store redeem screen, and ticks code 1; back in the app the button reads "Redeem code 2…";
   - tap code 1's tick: it goes off and the button goes back to code 1; tap Redeem again to re-tick;
   - redeem codes 2–4 the same way; the button ends on "All redeemed".
   The mock codes won't redeem in the App Store; that's expected. Only the in-app sequence is being tested.
4. Close and reopen the app. In Your codes, the order's tag shows how many codes are left (or "Redeemed"), and the ticks are still there.
5. Optional, if the wallet still has enough: Pro, 1 month (2 codes) with Stars (18 real Stars), to see the same flow for a Stars order.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy or use mainnet.

## Report back
- Order memo, status sequence and tx hash; the number of codes; pass/fail for each step in 3 and 4, with exact text for anything wrong.
