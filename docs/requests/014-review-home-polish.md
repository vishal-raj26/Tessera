# 014: Review the home screen redesign and check it on the owner's iPhone

**Status:** open
**Base:** `claude/home-polish` (PR on top of `main`).
**Why Codex:** reviewer role, plus Windows tests and the owner's iPhone in Telegram.

## What changed
1. **A look per plan** (`web/src/tiers.ts`): plans get a palette by rank within their product: clay (1st), silver (2nd), black and gold (3rd). Used by the 3D card (`three/cardScene.ts`: body, foil, edge metal, rim light), the CSS card (`.tier-N`), and a background glow that follows the front card.
2. **Opening moment** (`components/MosaicIntro.tsx`): 40 tiles fly in and form the first card (~0.8 s), then the real card takes over and the others are dealt in. Once per session (`sessionStorage`), only for the first carousel, never with reduced motion. The floor pattern is now faint mosaic tiles.
3. **Personal header**: returning buyers see "<App> <Plan> · N days left" with **Renew**, which selects that plan, term and store and opens the review. Days left come from `web/src/coverage.ts` (30 days per month, 365 for the yearly plan, same plan's purchases stack; matches the server's renewal reminder). New buyers see the title plus one line ("Pay with GRAM or Stars, get your code right away."), hidden on screens under 700px tall. The server now sends `deliveredAt` on orders.
4. **Plan value line** under the card: the plan's catalog blurb.
5. **Price**: counts to its new value on plan or term change (`components/CountUp.tsx`, instant with reduced motion); a green "live" dot pings when the GRAM rate moves the price on screen.
6. **Robustness**: if a phone drops a 3D card's WebGL context, the card falls back to the CSS card instead of going blank (`Card3D.tsx`).

Found and fixed while testing: the live dot's CSS class (`.live`) collided with the cards' `live` class and squashed the front card to 10px; it's now `.price-live`.

## Evidence (Linux, headless Chromium, 393×852 and 375×667)
- `npm test`: 131 server + E2E OK + 12 web (6 new for `coverage.ts`).
- Screenshots checked: each tier (CSS and 3D), the mosaic in flight, a returning buyer and Renew opening the right review (Pro, 3 months, 4 codes), and small-screen fit (the bottom hint fits on 375×667 for new and returning buyers; a new buyer matches `main` exactly).
- Headless software 3D loses contexts after a few seconds (on `main` too), so the full carousel in 3D can't be judged here; a single 3D card was rendered per tier and looks right. **The iPhone check matters for this.**

## To do
1. Review the PR. Focus: no Claude-only assumptions (tiers by rank, product names from the catalog); Renew opens the review for exactly the order's plan, term and store; the opening can't replay after a store or app switch; reduced motion; performance (transform/opacity only; the 3D scene change only swaps materials).
2. Windows: `npm test` (expect 131 server, E2E OK, 12 web), `cd web && npx tsc -b --noEmit && npx vite build`.
3. `npm run live` from this branch on testnet. On the owner's iPhone in Telegram:
   - fully close and reopen Telegram's app view: the tiles form the first card once; reopening within the same session doesn't replay it;
   - swipe through the plans: clay Pro, silver Max 5×, black and gold Max 20× in 3D; the background glow follows; nothing blank or flat;
   - the header shows the owner's latest plan with days left (the testnet Pro 3-month order should show about 90 days minus the days since) and Renew opens its review; don't pay;
   - the value line changes with the plan; the price counts when switching plans and terms; with Settings › Accessibility › Reduce Motion on, nothing animates and nothing replays;
   - leave the home screen open for a minute: the price stays put, or pings the green dot if the rate moved.
4. Post the review and results on the PR, blocking first.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy, use mainnet or spend real funds (no purchase is needed).

## Report back
- Review link with a line per finding; test, typecheck and build counts; pass/fail per iPhone check, with a screenshot of the home screen if possible.
