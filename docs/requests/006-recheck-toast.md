# 006: Recheck the toast position on iPhone (PR #16)

**Status:** done (owner results 2026-11-02: toast visible, airplane-mode tick PASS)
**Base:** `claude/ux-fixes` @ latest (PR #16).

## The fix
The toast ("Code copied", errors) was fixed at `top: 16px`, under the Dynamic Island and Telegram's top bar. It now sits 12px below whichever reaches lower: the device safe area (`env(safe-area-inset-top)`) or Telegram's (`--tg-safe-area-inset-top`), plus Telegram's content safe area (`--tg-content-safe-area-inset-top`) in fullscreen. Only `web/src/index.css` changed (`.toast`).

## To do
1. `npm test`, `cd web && npx tsc -b --noEmit && npx vite build` on Windows.
2. Restart `npm run live` on the updated branch. On the owner's iPhone in Telegram, show a toast (Your codes › tap a code to copy) and check it is fully visible below the Dynamic Island and Telegram's bar, both in the normal sheet and in fullscreen.
3. If the owner can, also the airplane-mode Redeem check on an existing two-code order (the tick comes back off with a message, and that message is fully visible).
4. The funded multi-code purchase stays skipped.
5. Post the result on #16.

## Don't
- Commit or paste secrets. Change app code. Merge, deploy or use mainnet.

## Report back
- Test, typecheck and build counts; pass/fail for each iPhone check, with a screenshot of the toast if possible.
