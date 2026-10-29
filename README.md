# Tessera

A Telegram Mini App for buying **App Store credit for a Claude Pro / Max plan with GRAM or Telegram Stars**. The user picks a plan and pays from their TON wallet or with Stars. They get the code(s) and a short guide to redeem them and subscribe inside the Claude iOS app. The App Store country is a server setting and isn't shown to users.

```
web/     React + Vite Mini App: TON Connect, Framer Motion (swipe plans, pull the card down to buy),
         CSS 3D card (tilt + Telegram DeviceOrientation, black-to-pearl reveal), App Store-style onboarding,
         Mini Apps 2.0: full screen with safe areas, home-screen shortcut, closing guard, haptics, CloudStorage
server/  Node API: pricing, orders, payment engine (TON Center streaming + v3 poller), admin bot,
         supplier adapter (mock or Bitrefill)
```

## Quick start: live in Telegram on testnet (about 5 minutes)

Requires Node 22+ and [`cloudflared`](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (Windows: `winget install Cloudflare.cloudflared`).

```bash
npm run setup          # installs server and web
npm run testnet:setup  # creates a testnet merchant wallet and writes server/.env for testnet
```
Create a bot in Telegram with @BotFather → /newbot, then:

```bash
npm run bot:setup      # paste the token when asked, then send /start to your bot when it says so
```
This saves the token and makes you the admin in `server/.env`, sets the bot's name, description and command menus (buyers: /start /paysupport /terms; you: /issues /order /prices /price), and sends you a confirmation message. Safe to run again. Afterwards, in @BotFather, set the picture with /setuserpic (`web/public/icon-512.png`).

A TON Center key in `TONCENTER_API_KEY=` is optional but makes payment detection instant.

```bash
npm run live           # builds, opens a public HTTPS tunnel, starts the server, points your bot's menu button at it
```
Open your bot in Telegram and tap **Open**. To run the scripted real testnet purchases, in a second terminal:

```bash
npm run testnet:buy    # prints a testnet address; send it ~1 testnet GRAM from @testgiver_ton_bot; it then buys twice and checks delivery
```

For a permanent server, use the Dockerfile: `docker compose up -d` (settings from `server/.env`, database in a volume).

## Run it locally (demo mode, nothing real moves)

```bash
cd server && npm install && npm run dev        # API on :8787: mock supplier, mock payments
cd web    && npm install && npm run dev        # Mini App on :5173, proxies /api to :8787
```

Open http://localhost:5173 (add `?intro=1` to see the onboarding again). In demo mode the Pay button skips the wallet and issues fake codes, so you can walk through the whole flow.

## Tests

```bash
cd server
npm test            # engine, bot, Stars, streaming, guardrails and chain helpers (32 tests)
npm run test:e2e    # starts the server in chain mode against a fake TON Center and pays two orders end to end
```

## Real payments on testnet

1. Get testnet GRAM for a test wallet. In Tonkeeper, turn on testnet in dev settings, then use the testnet faucet bot.
2. Create a second testnet wallet to receive payments. Its address is your `MERCHANT_WALLET`.
3. Get a free TON Center API key (one key covers both REST and streaming).
4. Set these in `server/.env` and restart:
   ```
   PAYMENT_MODE=chain
   TON_NETWORK=testnet
   MERCHANT_WALLET=0Q...your testnet receiving address
   TONCENTER_API_KEY=...
   ```
5. Open the Mini App through your bot in Telegram (TON Connect needs HTTPS; see below), connect the test wallet and buy a plan. The wallet must be on testnet too, or it will refuse the request.

What to check on testnet:
- **Exact amount:** pays and delivers, and the "Payment seen, confirming" step appears within a second or two.
- **Underpay, then top up:** send part of the amount with the memo, then send the rest with the same memo. The order should finish.
- **Pay after the 20-minute price hold:** still delivered if within 2 hours.
- **Cancel in the wallet:** shows "Payment cancelled… Nothing was charged".

### How payment detection works

- **Streaming (instant):** the server subscribes to the merchant address on TON Center's Streaming API (SSE).
  - A *pending* transfer only marks the order as "payment seen".
  - The order is paid and the code bought only when the transfer is *finalized* in the masterchain.
- **Poller (backstop):** every 15 seconds the v3 REST API is checked too, because the stream doesn't replay events it missed while disconnected. Set `TON_STREAM=off` to use polling only (every 5 seconds).
- **Matching:** each order has a unique memo (`TS-…`). Every incoming transfer is recorded once by its hash, so seeing it twice never buys twice.
- **Top-ups:** transfers with the same memo add up, so an underpaid order can be completed with a second payment.
- **Anything odd goes to the admin bot:**
  - a memo that doesn't match any order;
  - a payment for an order that's already done or refunded;
  - a payment more than 2 hours late;
  - a supplier failure;
  - a purchase interrupted by a restart. These are never re-bought automatically, because the supplier may already have charged.

## Telegram Stars

Telegram's rules say digital goods sold inside bots and Mini Apps must be paid in Stars ([Bot Payments for Stars](https://core.telegram.org/bots/payments-stars)), so Stars is offered next to GRAM. The buyer picks one on the review sheet; the choice is remembered.

- **Checkout:** the server creates an invoice link (`createInvoiceLink`, currency `XTR`) and the app opens Telegram's own payment sheet with `openInvoice`.
- **Before the charge:** Telegram sends a `pre_checkout_query`. The bot approves it only if the order belongs to that buyer, the amount matches and the 20-minute price hold hasn't run out.
- **After the charge:** the `successful_payment` message pays the order. Its charge id is recorded once, so a repeated update never buys twice.
- **Refunds:** for a Stars order, the admin bot's **Refund Stars** button really refunds through `refundStarPayment`, then marks the order refunded. Delivered orders can't be refunded.
- **Pricing:** `stars = cost × (1 + STARS_MARGIN) ÷ STAR_USD`. `STAR_USD` is what one Star is worth to *you* when you withdraw it, not what buyers pay for Stars, so the price covers your cost. Buyers pay noticeably more in Stars than in GRAM because of Telegram's and the app stores' cut.
- Stars you earn are withdrawn to TON through Fragment after Telegram's holding period, so you pay for codes before that money arrives.
- Without `BOT_TOKEN` (local demo) Stars runs in demo mode: no invoice, the payment is simulated.

## Admin bot

Uses the same bot as the Mini App. Set `BOT_TOKEN` and `ADMIN_CHAT_IDS` (your Telegram user id, or a group id; comma-separated).

- **Alerts** go out for failed, underpaid, unmatched and extra payments, with **Retry** and **Mark refunded** buttons. Refunds need a second confirming tap.
- **`/issues`** lists every order that needs attention.
- **`/order <id or memo>`** shows one order.
- **`/prices`** shows the in-app prices we sell against; **`/price max5_m 129.99`** changes one without a redeploy.
- **Price-feed watchdog:** on mainnet, if the GRAM/USD rate is more than 10 minutes old, new orders pause and you get an alert (and another when it recovers).
- **Renewal reminders:** about 27 days after delivery, the buyer gets a message that their month renews soon, with a button back into the app.
- **Buyers** get a message when their code is ready, when it's delayed, when they underpaid (with the amount still owed), and when they're refunded.

- **Support inbox:** anything a buyer writes to the bot is forwarded to you with their recent orders. Reply to that message and the bot sends your answer to the buyer. `/paysupport` and `/terms` (both required by Telegram for bots that take Stars) are answered automatically.

GRAM refunds are sent by you from the merchant wallet; the bot only records them. Stars refunds are sent by the bot itself.

## Going live

1. **Bitrefill Business API:** set `SUPPLIER=bitrefill` with `BITREFILL_API_ID` and `BITREFILL_API_SECRET`. The adapter was written from the public docs, so test it with Bitrefill's test products first.
2. **Mainnet:** set `TON_NETWORK=mainnet` and your real `MERCHANT_WALLET`.
3. **Telegram:**
   - Set `BOT_TOKEN`. Every API call then requires valid `initData`, verified with HMAC.
   - In BotFather, set the Mini App URL to your HTTPS host and upload `web/public/icon-512.png`.
4. **Host:** run `npm run build` in `web/`, then `npm start` in `server/`. The server serves `web/dist` and the TON Connect manifest (built from `PUBLIC_URL`).

### Environment (`server/.env`)

| Var | Purpose |
|---|---|
| `PORT` | API port (default 8787) |
| `PUBLIC_URL` | Public HTTPS URL of the Mini App (TON Connect manifest, bot "Open" buttons) |
| `BOT_TOKEN` | Telegram bot token; turns on initData verification and the admin bot |
| `ADMIN_CHAT_IDS` | Who gets order alerts and can press Retry / Refund |
| `STORE_REGION` | App Store country to sell credit for (default `US`; never shown to users) |
| `SUPPLIER` | `mock` or `bitrefill` |
| `BITREFILL_API_ID` / `BITREFILL_API_SECRET` | Business API credentials |
| `PAYMENT_MODE` | `mock` or `chain` |
| `TON_NETWORK` | `testnet` or `mainnet` (default) |
| `MERCHANT_WALLET` | Address that receives GRAM |
| `TONCENTER_API_KEY` | TON Center key for REST and streaming |
| `TON_STREAM` | `off` to disable streaming and poll only |
| `MARGIN` | Your markup over supplier cost (default `0.08` = 8%) |
| `GRAM_USD_FALLBACK` | Rate used in demo/testnet before the first live price arrives |
| `RATE_MAX_AGE_MIN` | Mainnet only: pause new orders when the rate is older than this (default 10) |
| `STARS` | `off` to hide the Stars option (default on) |
| `STAR_USD` | What one Star is worth to you on withdrawal, in USD (default `0.013`) |
| `STARS_MARGIN` | Markup for Stars orders (defaults to `MARGIN`) |
| `TEST_PRICE_SCALE` | Testnet only: multiply GRAM amounts (e.g. `0.01`) so faucet coins cover test buys |

## How pricing works

- `server/src/catalog.js` holds the Claude in-app price for each App Store country (October 2026 data). Re-check these regularly.
- The credit needed is the in-app price, plus a tax buffer for the US (+10%) and Canada (+15%), where App Store prices exclude sales tax.
- The cheapest mix of card denominations (at most 3 codes, with a preference for a single code) is chosen to cover it.
- The price in GRAM is `supplier cost × (1 + MARGIN) ÷ GRAM/USD`, locked for 20 minutes.

## Before launch: things to check

- **Region:** a code only redeems on an Apple ID from `STORE_REGION`. The app doesn't tell users this, so expect some support requests from people with other countries' Apple IDs.
- **Terms:** Apple's gift card terms restrict resale, and Bitrefill has its own rules for reselling through its API. Get proper advice on both.
- **Branding:** keep the app under its own name and mark. "For Claude Pro/Max" in text is fine, but don't use Anthropic's logo.
- **Renewals:** the guide tells users that Apple renews monthly and charges their card when the balance runs out. Keep that wording.
