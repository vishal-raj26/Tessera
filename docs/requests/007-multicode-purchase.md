# 007: Multi-code purchase on testnet

**Status:** done (2026-11-03, PASS on `main` @ 67f4020; evidence below). Real Bitrefill catalog and cost verification is a separate, still-open dependency.
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

## Result (2026-11-03): PASS
Reported by Codex on PR #17 (https://github.com/vishal-raj26/Tessera/pull/17#issuecomment-6586860940).
- Code: `main` @ 67f4020 (tree identical to the reviewed `25081bb`). Testnet, chain payment, mock supplier, `TEST_PRICE_SCALE=0.01`.
- Before paying: Pro, 3 months, 4 codes, quoted 0.68 test GRAM; buyer balance 2.428 test GRAM. The owner checked the quote and network and paid on the iPhone.
- Memo `TS-B03C4D6FF7`; 0.68 test GRAM quoted and received (680000000 nano); tx `ta/RXqiH33ouoM4X8kA2XndV/tFv+HMHm7kUjxUmcUw=`.
- Status: awaiting_payment → payment seen (~6 s) → delivered (~8 s from creation) with 4 codes. `paid`/`fulfilling` weren't sampled individually (the observer hit a transient database read lock); final delivery was verified separately.
- Redeem flow (owner): numbered codes, code 1 highlighted; Redeem copies, opens the App Store, ticks and moves on; unticking returns to code 1; all four end on "All redeemed".
- After closing and reopening: all four ticks kept, tag "Redeemed". Database check: 4 codes, marks `[true, true, true, true]`, exact amount, delivered.
- Not done: the optional Stars payment. Mock codes don't redeem in the App Store, as expected.
