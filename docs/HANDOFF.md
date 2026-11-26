# Tessera handoff

## Latest: `main` after PR #59 (2026-11-27), from Claude

Read this section first. Older sections below are history.

### What Tessera is now
A Telegram Mini App (brand "Tessera", owner goes by Vixxance, Telegram @vixxance) that sells AI app
subscriptions as **App Store or Google Play credit codes**: Claude (Pro, Max 5×, Max 20×), ChatGPT (Go,
Plus), Grok (Lite, Super, Plus, Heavy). Buyers pay in **GRAM (TON) only**. Codes are bought from a
supplier (mock today, Cryptorefills/Bitrefill later) and shown in the app to redeem.

### Where it runs
- **Hosting:** Railway, project "optimistic-balance", service "Tessera", public URL
  `https://tessera-production-9d3cf778.up.railway.app`. Builds from `Dockerfile` (`railway.json`),
  healthcheck `/healthz`. **Railway auto-deploys every push to `main`.** A volume is mounted at `/data`
  (set `DB_PATH=/data/tessera.db`).
- **Mode today:** TON **testnet**, `PAYMENT_MODE=chain`, `SUPPLIER=mock` (fake codes), `RELAY=test`
  with a Relay API key. Mainnet and a real supplier need the owner's explicit go-ahead.
- **Bot:** on start, the bot sets its menu button to `PUBLIC_URL` (server/src/bot.js). Buyer messages
  to the bot are forwarded to admins (`ADMIN_CHAT_IDS`).
- Env names the server reads (values live only in Railway / `server/.env`, never in Git):
  `PORT PUBLIC_URL BOT_TOKEN ADMIN_CHAT_IDS STORE_REGION SUPPLIER BITREFILL_* PAYMENT_MODE TON_NETWORK
  MERCHANT_WALLET TONCENTER_API_KEY TON_STREAM MARGIN REF_SHARE REF_MONTHLY_CAP_USD MINIAPP_LINK
  GRAM_USD_FALLBACK RELAY RELAY_API_KEY STARS TEST_PRICE_SCALE DB_PATH PRODUCTS APPLE_PRICE_SYNC`.

### Owner's standing instructions (keep following these)
- Work on `claude/<task>` (or `<agent>/<task>`) branches and open a PR for each change. **The owner has
  authorised merging Tessera PRs without asking each time**, once tests pass and the change is checked
  in a browser. Merging deploys to Railway.
- Always end replies to the owner with what to do next. Don't repeat the same closing question.
- No repeated information on a screen. Keep screens clean and roomy ("too cluttered" is the most
  common note). Give options before big visual changes; the owner often rejects mockups, so ask.
- **No glow effects** on new work. Matte, shadows and clean shapes are fine.
- Never paste or commit secrets (`.env`, wallet phrases, bot token, API keys). The owner types keys into
  Railway themselves.
- No mainnet, no real funds, no real supplier purchases without explicit authorisation.
- Don't mention gift cards or the supplier in the UI. Say "App Store credit" / "Google Play credit".
- The GRAM gem icon goes **after** amounts (`<Amount gram={…} />`, `<GramIcon />`).
- Brand logos are allowed now: the owner supplied them (`web/public/models/logo-*.png`, print and holo
  textures). Don't draw brand logos yourself. Coin and chain logos come from Relay's API.
- The store country **is** shown (the owner asked for it; it overrides the old "never show the region").

### Payments and money
- **GRAM only.** Stars are switched off until Telegram lets users convert Stars to GRAM: the app has no
  Stars UI, and the server refuses Stars unless `STARS=on`. The Stars code paths (bot invoices,
  `engine.applyStars`) still exist and are tested, so turning it back on is one env var plus UI work.
- Telegram's rule: bots take only Stars/GRAM for digital goods, so Tessera never accepts other coins
  itself. **Relay** (relay.link) is used only so a buyer can **top up their own wallet** with GRAM from
  USDT/USDC/ETH/SOL/BTC (Add GRAM sheet). Server: `server/src/relay.js`; routes `/api/relay/options`,
  `/api/relay/topup`, `/api/relay/topup/status`, `/api/relay/topup/sim` (test mode).
- Pricing: cost of the supplier's cards × (1 + `MARGIN`, default 8%) in GRAM at the live rate.
  Credit bought = in-app price + up to 12% US sales tax, so e.g. Claude Pro 1 month = one $25 card.
  Margin is thin (about $2 profit on a Pro month at retail supplier prices); a pricing pass with real
  supplier costs is still pending.

### Referrals (PR #48)
- Each user has a link `…?startapp=ref_<code>` (`/api/referral`). Only brand-new users opening through
  it are linked (claimed in `/api/me` from Telegram's signed `start_param`).
- On each **delivered GRAM** order of a referred friend, the referrer gets `REF_SHARE` (25%) of our
  margin as GRAM credit, capped at `REF_MONTHLY_CAP_USD` ($25) a month. No reward for Stars, self-referral
  by account, or paying from a wallet the referrer uses.
- Credit is a ledger (`credits` table: reward / spend / release, unique per order). It comes off the
  next GRAM order automatically ("Invite credit" row at checkout); if it covers the whole price the
  order is paid without a transfer. Expired (past the late window) or refunded orders release it.
- Code: `server/src/referrals.js`, tests `server/test/referrals*.test.js`.
- Invite links need the bot's **Main Mini App** enabled in BotFather, or `MINIAPP_LINK` set.

### App structure (web/)
- `src/App.tsx` holds views (`home`, `paying`, `done`, `wallet` = Codes, `me` = You) and sheets
  (`review`, `guide`, `topup`, `region`). Styles: `src/index.css` (base) and `src/ui.css` (current
  design, loaded after; most recent rules are at the bottom).
- Per-app accent: `.app[data-product=…]` sets `--clay` (orange Claude, blue ChatGPT, grey Grok).
- Opening logo: pure CSS `#splash` in `index.html`; App fades it after ~2 s.
- Header (`components/Header.tsx`): logo (home), store-country chip and wallet balance; each opens a
  popover (`Region.tsx` RegionPop, `WalletSheet.tsx`).
- Home (`components/Showcase.tsx`): three centred app tiles (diagonal drifting logo pattern, brand
  colour from the bottom, name / plans / "from N ◆" pill, prices count up once per session), plus a
  small "How Tessera works" pill that replays the intro.
- Bottom bar (`components/Dock.tsx`): oval with Home · Codes · You; current tab follows the app accent.
- You (`components/Profile.tsx`): photo, name, member since, highlighted Invite card, stats
  (purchases, spent, credit received), your apps; a headset icon top-right opens t.me/vixxance.
- Add GRAM (`components/TopUp.tsx`): one panel of connected steps (coin → network → send); nothing
  preselected; networks appear only after a coin; QR + address + "send at least".
- Checkout (review sheet in App.tsx): price, a details card (credit, plan price, invite credit), terms
  checkbox, Pay, held-price timer, quiet Add GRAM line.
- 3D product cards: `src/three/cardScene.ts`, `components/HoloCard.tsx`. Aurora shader:
  `components/Aurora.tsx` (payment light: warms up, edge at issuing, one beam lap, flash on done).

### Checks
- Server: `cd server && npm test`: **151 pass**. Web: `cd web && npm test` (20 pass), `npx tsc -b
  --noEmit`, `npx vite build`.
- Visual checks were done with Playwright against `vite --port 5179` (proxy to the server on :8787 in
  demo mode, `BOT_TOKEN` empty). `?devwallet=<address>` stands in for a connected wallet on the dev server
  only. The cloud workspace can't reach Relay, Telegram or Railway from the shell; Relay logos render as
  letters there.

### Last session (PRs #48–#59)
#48 referrals + cleaner You dashboard · #49 Stars removed from the app, roomier checkout · #50/#51 Add
GRAM picker and connected panel · #52 shared bottom bar, Help in Settings · #53 home tiles centred,
diagonal pattern, support icon · #54 drifting pattern + price count-up · #55 matte/shadows, oval bar,
headset icon, button shadows · #56/#57 guide pill (now small, for everyone), bar follows app colour ·
#58 stronger matte tiles, **reverted in #59 at the owner's request** (tiles are back to the #57 look).

### Open / next
- **Home tiles:** the owner wants a new shape and material related to the checkout card, but rejected
  four mockups (mini credit card, cards in a wallet, foil edge, satin metal) and the stronger matte
  version. Ask for a reference image before trying again.
- **"Your codes" screen:** the owner asked for "something new"; not designed yet.
- **Bottom bar:** the owner asked what else could go there; suggestions given (Add GRAM, Invite,
  Activity), no choice yet.
- **Pricing pass:** needs real supplier costs (Cryptorefills partner ID / Bitrefill Business). Then set
  margin, tax buffer and referral share together. Grok SuperGrok plans may be discontinued; check.
- **Mainnet + real supplier + Relay live:** separate, owner-authorised task.
- **Stars:** re-enable (`STARS=on` + UI) only when Telegram ships Stars → GRAM for users.
- Testnet end-to-end purchase in Telegram on the latest build (GRAM, invite credit, Add GRAM) by the
  owner is still to be reported.

## Earlier: `main` @ 67f4020 (2026-11-03)

PRs #1–#17 are merged into `main` (#17 → #16 → #15 → `main`; #1–#14 were contained and are marked merged). `main`'s tree is identical to the reviewed and tested `25081bb`.

**What's on `main`**
- Multi-product catalog (Claude first), App Store and Google Play credit, GRAM (TON) and Telegram Stars payments, live GRAM rate, App Store price sync, 1/3/6/12-month terms (12 = the store's yearly price), testnet price scaling.
- 3D plan cards, pull-to-buy with rays (hold or downward pull only), clearly disabled Pay until the terms are accepted.
- Codes redeemed one at a time with saved ticks (`POST /api/orders/:id/codes/:index`, `web/src/markQueue.ts`).
- Pricing (`server/src/pricing.js`): in-app price → credit plus maximum sales tax (US 12%, CA 15%, `tax:<REGION>`) → the supplier's cards for exactly that store, country and currency → cheapest mix (ties: fewer codes, less leftover; at most 20 codes).
- Supplier cache (`server/src/supplier/cache.js`): 5-minute refresh, last good data for up to 30 minutes on outages, cards dropped at once on supplier refusals (refresh or purchase), generation checks so older refreshes can't restore them.
- Mock supplier: cards recorded from Bitrefill's public storefront on 2026-11-02 (US App Store, US Google Play, DE App Store; retail prices). Refuses mainnet with real payments.
- Bitrefill adapter: documented fields only; prices nothing until `BITREFILL_COST_FIELD` / `BITREFILL_COST_CURRENCY=USD` are set from a recorded response (`npm run supplier:record`); re-checks availability before each purchase.

**Verified:** `npm test` 131 server + E2E + 6 web (Linux and Windows), `tsc`, `vite build`. Testnet in Telegram: GRAM and Stars purchases delivered; on the final `main` code, a Pro 3-month GRAM purchase (0.68 test GRAM, memo `TS-B03C4D6FF7`) delivered 4 codes in ~8 s and the full redeem flow passed, with ticks kept after reopening (request 007); airplane-mode tick rollback, Pay/rays/toast checks on the owner's iPhone; Pro 1-month price ($22.40 needed, one $25 card).

**Not verified (open):**
- Bitrefill: pending credentials. Recording the real catalog and verifying the cost field and currency is request 013 (blocked until the owner has Business API credentials). After that: real availability and costs per region, range (custom amount) pricing, an invoice price check before paying.
- `npm audit`: 2 high (server, `@ton/ton` → `zod`; `@ton/ton` isn't imported by server code) and 3 low (web, `@tonconnect/ui` → `deepmerge`).
- Hosting and mainnet are separate, owner-authorised tasks.

## Earlier: `claude/payment-followups` (Claude)

- Base: `codex/payment-repair-handoff` (PR #1) merged with `codex/testnet-fixtures` (PR #4). Merge those two first; this PR's own diff is then just the follow-ups.
- **Real-payload tests** (`server/test/real-fixtures.test.js`): both readers accept Codex's captured fresh-wallet credit (`TS-628AF91308`, 0.209933333 GRAM). The stream payload has **no pre-decoded comment**, and the memo is decoded from the raw body. Both readers give the same hash, so the engine buys once.
- **Review finding 1 fixed:** a transfer to the merchant with a `TS-` memo that `isCreditedIncoming` rejects (missing field, active/frozen account, bounced back) now sends one admin alert, "Payment not recognised", deduped by tx hash in `settings`. It is never paid automatically. The stream only flags *finalized* rejections. Bounced messages, other accounts and memo-less transfers are ignored.
- Checks: 67 unit tests and `test:e2e` pass.
- Not covered by tests: the `flagRejected` dedupe in `index.js` (index.js isn't importable in tests).

## Earlier: `codex/payment-repair-handoff` (Codex)

- Branch: `codex/payment-repair-handoff`.
- Base: `87cbf3b` (`Add Telegram Stars checkout next to GRAM`). This branch preserves that work.
- Purpose: bring the previously tested GRAM payment repair into the GitHub source and establish shared agent instructions.

## Payment changes

- Share transfer classification between the TON stream and poller. Recognize a confirmed, non-bounceable credit to an uninitialized merchant wallet even when computation is skipped with `no_state`. Continue rejecting bounced transfers and other aborted transactions.
- Pay test-buyer forwarding fees separately so the merchant receives the exact quote. Stop the buyer if its wallet sequence number does not advance.
- Include regression tests and an optional paced buyer launcher for the public TON Center endpoint (`node scripts/testnet-buy-paced.cjs`).
- Preserve exact underpayment accounting, finalized-only GRAM fulfillment, transaction deduplication, and separation of GRAM and Stars orders.

## Verification

On the earlier ZIP-based local copy, Codex verified 52 unit tests, fake-chain integration, and both live testnet purchases: exact 0.2 GRAM and 0.12 + 0.08 GRAM top-up. Live delivery used the mock supplier and sample codes. These results do not validate Telegram Stars or real supplier fulfillment.

On this branch, `npm test` passed all 58 unit tests (including the new Stars tests) and the fake-chain integration test. `npx tsc -b --noEmit` and `npx vite build` passed. A separate reviewer found no actionable issues and independently passed the 26 new regression tests. No new live transfers were sent from this checkout; the live testnet evidence above belongs to the earlier local copy with the same GRAM repair.

Real wallet files, `.env`, and database history remain outside this checkout and are not included in Git. Existing npm audit reports two high-severity server findings and three low-severity web findings; dependency remediation is outside this sync and remains open.

## Working together

Use GitHub branches and pull requests as the shared record. Read this handoff and `AGENTS.md` at the start of a task, fetch current remote changes, and agree on ownership before touching the same files. Separate chats do not themselves constitute a handoff; record the relevant result here.

Next milestone after review and merge: exercise the Mini App through Telegram on testnet. Telegram Stars checkout needs its own verification. Supplier credentials and any production/mainnet switch require a separate authorized task.

## Local commands

Requires Node 22 or newer and installed dependencies (`npm run setup`). On this Windows machine the existing npm test command's POSIX environment syntax works with Git Bash as npm's script shell:

```powershell
$env:npm_config_script_shell='C:\Program Files\Git\bin\bash.exe'
npm test
```

For the frontend checks, run `npx tsc -b --noEmit` and `npx vite build` from `web`.
