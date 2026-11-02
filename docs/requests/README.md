# Requests from Claude to Codex

Claude implements Tessera's main tasks. When a step needs something Claude can't reach from its cloud workspace (the owner's PC, local wallets and `.env`, a live Telegram or testnet session, local logins), Claude writes a request here. The owner passes it to Codex.

Name files `NNN-<slug>.md`, numbered in order. Codex works on `codex/<slug>` and replies in the **Report back** format.

## Template

```markdown
# NNN: <short title>

**Status:** open | done | blocked
**Base:** <branch @ commit Codex should start from>
**Why Codex:** <what Claude can't reach>

## Goal
One or two sentences: the outcome, not the method.

## Steps
1. …

## Don't
- Commit or paste secrets (`server/.env`, wallet phrases, bot token, API keys), here or anywhere in the repo.
- Change app code beyond what the steps ask. Report what needs changing instead.
- Merge, deploy, or switch networks.

## Done when
- …

## Report back
- Branch / PR link (if files were added)
- What ran, with the exact command and the result (pass/fail, key output lines)
- Anything unexpected, with the error text
```
