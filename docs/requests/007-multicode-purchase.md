# 007: Multi-code purchase on testnet

**Status:** open, pending until the owner adds test GRAM (wallet ~0.428 test GRAM on 2026-11-03; the GRAM purchase needs ~0.67).
**Base:** `main` @ 67f4020 or later.
**Why Codex:** needs the owner's PC, testnet wallet and Telegram.

## Expected quotes on `main`
US App Store, mock supplier (recorded storefront cards), `TEST_PRICE_SCALE=0.01`, 12% US tax. Code counts and Stars come from the running API on `main`. GRAM depends on the live rate; the column is at ~$1.20 per GRAM.

| Plan | Credit needed | Cards | Codes | GRAM (testnet) | Stars (real) |
|---|---|---|---|---|---|
| Pro, 1 month | $22.40 | $25 | **1** | ~0.24 | 21 |
| **Pro, 3 months** | $67.20 | $70 | **4** | **~0.67** | 59 |
| Pro, 6 months | $134.40 | $135 | 3 | ~1.25 | 110 |
| Max 5×, 1 month | $139.99 | $140 | 3 | ~1.30 | 115 |

Pro, 1 month is a single code now, so it can't test the multi-code flow. The cheapest multi-code plan is **Pro, 3 months**.

**Before any payment:** open the review sheet and note the plan, the code count and the exact GRAM or Stars amount shown. Only pay if the code count is more than 1 and the amount fits what the owner approved. If the code count differs from the table, report it and don't pay.

## To do (once the wallet has enough test GRAM)
1. Make sure `npm run live` runs the latest `main` (testnet, `PAYMENT_MODE=chain`, mock supplier, `TEST_PRICE_SCALE=0.01`).
2. Check the wallet balance against the quoted amount. If it's short, stop and report the balance and the quote.
3. In Telegram on the owner's iPhone, buy **Pro, 3 months** with GRAM from the testnet wallet. Note the code count on the review sheet (expected 4).
4. Expected flow: payment seen → confirmed → codes revealed. On the done screen:
   - codes are numbered, code 1 is highlighted, the button reads "Redeem code 1 in App Store";
   - tapping it copies code 1, opens the App Store redeem screen, and ticks code 1; back in the app the button reads "Redeem code 2…";
   - tap code 1's tick: it goes off and the button goes back to code 1; tap Redeem again to re-tick;
   - redeem the remaining codes the same way; the button ends on "All redeemed".
   The mock codes won't redeem in the App Store; that's expected. Only the in-app sequence is being tested.
5. Close and reopen the app. In Your codes, the order's tag shows how many codes are left (or "Redeemed"), and the ticks are still there.
6. Optional, only with the owner's explicit OK because Stars are real money even on testnet: Pro, 3 months with Stars (expected 59 real Stars, 4 codes; check the amount on the review sheet first), to see the same flow for a Stars order.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy or use mainnet. Pay more than the amount shown and approved.

## Report back
- The quoted plan, code count and amount before paying; order memo, status sequence and tx hash; pass/fail for each step in 4 and 5, with exact text for anything wrong.
