# Effort picker

Sizes up each request you send to Claude and sets the effort level to match, so quick questions stay fast and cheap while hard jobs get deeper thinking.

## How it picks

1. **You said so:** "use high effort", "effort: low", "think hard" or "ultrathink" in your message wins.
2. **Follow-ups** ("yes", "go ahead", "continue") keep the previous level.
3. Otherwise **Haiku sizes up the request** (one small, low-effort call) and answers low, medium, high or xhigh. If that call fails, a simple word-based rule decides.

The auto picker never chooses `max`; you get `max` only by asking for it or pinning it. Each pick shows as a toast with a short reason, and the status line shows the current level. Subagents keep their own effort.

## Command

`/effort-picker` with one of:

- `auto`: size up every request (the default)
- `low` / `medium` / `high` / `xhigh` / `max`: pin that level until you switch back to `auto`
- `off`: leave effort to the session's own setting
- `status` (or nothing): show the mode and the last pick with its reason

## Install

```
/plugin install effort-picker --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner
```

Or from a shell: `claude plugin install effort-picker --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner`. See [../README.md](../README.md) for the desktop app.
