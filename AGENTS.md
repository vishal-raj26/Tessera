# Working on Tessera

Notes for coding agents (Codex, Claude, etc.) and contributors. Read README.md for what the app does.

## Product direction (from the owner)
Tessera sells **subscriptions to many apps**, not just Claude. Claude is the first product; more apps will follow, delivered as **App Store or Google Play credit**. Never add Claude-only assumptions:
- Products, plans and price keys live in `server/src/catalog.js` (`PRODUCTS`). Read names and labels from there (server) or from the API's `plan.product`, `plan.label`, `order.product` and `order.store` (app). Don't hard-code "Claude", plan names or "App Store" in UI or bot text.
- The store is part of every quote and order (`appstore` | `play`). Store-specific wording (redeem link, guide steps, "Apple"/"Google") comes from the order's store.
- Which products are on sale: the `PRODUCTS` env (default `claude`). Google Play prices are set by the admin (`/price play …`); a plan shows for Android only once priced.

## Shared work between agents
- Read this file, `docs/HANDOFF.md`, `git status`, and the recent commits before editing. Fetch the current remote state before starting a new task; preserve local changes.
- Use a separate branch for each task, such as `codex/<task>` or `claude/<task>`. One agent owns a branch while implementing; another can review its diff. Coordinate before editing the same files in parallel.
- Keep changes focused and preserve features added by the other agent. A handoff should name the branch and base commit, explain changes, list checks actually run and their results, and identify unfinished work.
- Update `docs/HANDOFF.md` when handing work over. Record facts and remaining decisions there; never put credentials, wallet phrases, or private configuration in it.
- Use pull requests for shared review. The owner has authorised merging Tessera PRs once tests pass and the change is checked (merging deploys to Railway). Never switch payment networks or use real funds without authorization.

## Layout
- `web/` React 19 + Vite + TypeScript Mini App. Entry `src/App.tsx`; Telegram wrapper `src/tg.ts`; API client `src/api.ts`; styles in `src/index.css` (base) and `src/ui.css` (current design, loaded after).
- `server/` Node 22 (ESM, no build step). `src/index.js` routes, `engine.js` order state machine, `stream.js` + `chain.js` TON payment detection, `bot.js` admin/buyer bot (and Stars checkout, currently off), `relay.js` Add GRAM top-ups, `referrals.js` invite credit, `supplier/` mock and Bitrefill adapters, `db.js` node:sqlite store.
- `scripts/` testnet setup, live tunnel, scripted testnet purchase.

## Commands
```bash
npm run setup                                  # install server + web
cd server && npm run dev                       # API on :8787, demo mode
cd web && npm run dev                          # app on :5173 (add ?intro=1 for onboarding)
cd server && npm test && npm run test:e2e      # must pass before committing
cd web && npx tsc -b --noEmit && npx vite build
```

## Rules that must hold
- **Payments:** GRAM only for now (on-chain, matched by memo). Stars (Telegram invoice) is off unless `STARS=on`; its code stays tested. A GRAM transfer never pays a Stars order. A transfer is applied once per tx hash and a Stars payment once per charge id; a GRAM order is only paid on a *finalized* transfer; never re-buy automatically after an interrupted purchase. Keep tests green; add a test for any engine/payment change.
- **Secrets:** never commit `server/.env`, `server/data/`, or `scripts/.testnet-*.json` (wallet keys). The repo is public: `server/.env.example` stays blank (a test fails if a secret is filled in); real values go only in `server/.env`.
- **Wording:** users see "App Store credit". Don't mention gift cards or the supplier anywhere in the UI. The store country is shown (owner's request).

## Design rules
- App brand logos: only the ones the owner supplied (`web/public/models/logo-*`, `print-*`, `holo-*`); never draw them. Coin/chain logos come from Relay. No Apple logos.
- Warm palette from `index.css` tokens (`--void`, `--panel`, `--ink`, `--clay`, `--pearl`); use tokens, not new colours.
- Amounts: number first, then the gem `<GramIcon />` (use `<Amount gram={…} />`). No ticker text next to them.
- Motion is purposeful (springs via framer-motion, haptics via `tg`). No decorative filler: no floating sparkles, badge pills, gradient blobs, orbiting icons, emoji. No glow effects on new work.
- Mobile first at 390px wide; respect the Telegram safe-area CSS variables.

## Roles (set by the project owner; takes precedence over other workflow notes)
- **Claude implements** every main task: features, fixes, refactors, docs. It works on `claude/<task>` branches and opens a PR for each one. (Since Nov 2026 the owner has had Claude do all the work itself, without Codex requests; another agent taking over should read `docs/HANDOFF.md` first.)
- **Codex reviews** Claude's PRs, and does only the tasks Claude can't do from its cloud workspace. Typical examples: anything on the owner's Windows PC, live Telegram or testnet runs with local wallets and `.env`, tools that need local logins.
- Claude sends those tasks as written requests in `docs/requests/NNN-<slug>.md`, using the template in `docs/requests/README.md`. The owner passes them to Codex.
- Codex does exactly what a request asks, on `codex/<request-slug>` branches, and answers in the request's **Report back** format. If a request turns out to need code changes beyond its scope, Codex reports that instead of making the changes, and Claude implements them.
