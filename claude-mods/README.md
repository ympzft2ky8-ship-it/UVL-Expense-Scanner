# Claude Code mods

Two mods for Claude Code. They are not part of the expense app; they change how Claude itself works while you use it.

| Mod | What it does |
| --- | --- |
| [effort-picker](effort-picker/README.md) | Sizes up each request and sets Claude's effort level (low to xhigh; max only when you ask). `/effort-picker` to pin or turn off. |
| [meter-and-handoff](meter-and-handoff/README.md) | Shows how full the context is and, at 85%, writes a handoff brief, clears the chat and continues in a fresh session. `/handoff` for status and settings. |

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install effort-picker --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner
/plugin install meter-and-handoff --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner
```

Answer `y` to add the marketplace, then pick a scope (user is first). From a shell instead:

```
claude plugin install effort-picker --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner
claude plugin install meter-and-handoff --marketplace ympzft2ky8-ship-it/UVL-Expense-Scanner
```

In the desktop app, where `/plugin` does not run: click + next to the prompt box, then Plugins, Add marketplace with `ympzft2ky8-ship-it/UVL-Expense-Scanner`, then Add plugin.

## Developing

Each mod checks and tests with `claude plugin validate <folder>` and `claude plugin test <folder>`. They are not part of `npm test`.
