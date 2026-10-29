# 001: Move the bot token, set up the bot, and capture real testnet payloads

**Status:** open
**Base:** `main` @ latest (pull first). Includes PR #2 if it's merged; if not, do step 1 by hand.
**Why Codex:** these steps need the owner's PC: the bot token in the local `.env`, the testnet wallet files, `cloudflared`, and a live Telegram session. Claude's workspace has none of these.

## Goal
1. The bot token lives only in the private `server/.env`, and the bot is fully configured and opens the Mini App.
2. We get real TON Center payloads for a fresh-wallet GRAM credit, so the payment check in PR #1 is tested against real data instead of hand-built data (review finding 2 on PR #1).

## Steps
1. **Secure the token.** The owner pasted the bot token into `server/.env.example`, a tracked file in a public repo.
   - Move the `BOT_TOKEN` value (and any other filled-in secret) into `server/.env`, creating it from the example if needed.
   - Restore the example with `git checkout -- server/.env.example`.
   - Confirm `git status` shows no change to `server/.env.example`, and that `git log -p --all -- server/.env.example` contains no token.
   - If the token was ever committed or pushed anywhere, stop and tell the owner to revoke it in @BotFather.
2. **Bot setup.** Run `npm run bot:setup`. When it says so, the owner sends `/start` to the bot from their own Telegram account; answer `y` to make them the admin. Then the owner sets the picture in @BotFather: `/setuserpic`, then `web/public/icon-512.png`.
3. **Live smoke test.** Run `npm run live` (testnet, `PAYMENT_MODE=chain`, mock supplier). The owner then checks in Telegram:
   - The bot's **Open** button opens the Mini App.
   - The bot answers `/terms` and `/paysupport`.
   - A message the owner writes to the bot from a *second* account shows up in the admin chat, and replying to it reaches that second account. Skip this check if there's no second account.
   - On the review sheet, the "Pay with" switch shows GRAM and Stars.
   - Paying with Stars opens Telegram's payment sheet. **Cancel it**, don't pay; the app should say nothing was charged.
4. **Capture real payloads.** While `npm run live` is running, run `npm run testnet:buy` (or `node scripts/testnet-buy-paced.cjs`) for one exact payment to a merchant wallet that is still uninitialised (`uninit`). Then save, as is:
   - `server/test/fixtures/v3-fresh-wallet-credit.json`: the merchant's transaction for that payment from `GET https://testnet.toncenter.com/api/v3/transactions?account=<merchant>&limit=5`. Keep just that one transaction object.
   - `server/test/fixtures/stream-fresh-wallet-credit.json`: the *finalized* SSE notification for the same payment from the streaming API. Log the raw `data:` line, for example with a temporary `console.log` in `stream.js` that you **don't** commit.
   - These payloads are public on-chain data. Don't edit or redact them, but make sure no API key or URL with a key ends up in them.
   - Commit only the two fixture files on `codex/testnet-fixtures` and open a PR. Claude will write the tests against them.

## Don't
- Commit or paste secrets (`server/.env`, `scripts/.testnet-*.json`, wallet phrases, bot token, API keys), here or anywhere in the repo.
- Change app code. If something fails, report it, and Claude fixes it.
- Merge PRs, deploy, use mainnet, or complete a real Stars payment.

## Done when
- `server/.env.example` is clean and the bot works from `server/.env`.
- The five Telegram checks in step 3 are reported.
- A PR from `codex/testnet-fixtures` holds the two fixture files.

## Report back
- Step 1: done / problem, and whether the token was ever committed anywhere.
- Step 2: the `bot:setup` output (it prints no secrets).
- Step 3: each of the five checks, pass or fail, with the exact error text for any failure.
- Step 4: the PR link, the merchant address, and the tx hash used.
