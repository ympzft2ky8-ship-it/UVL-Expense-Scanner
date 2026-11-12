# UVL Expenses

Receipt scanning and expense tracking for Urban Vibes Living LLC. An installable web app for iPhone and iPad: scan a receipt, have it read automatically, check it, and export one spreadsheet per tax year.

- **Owners:** start with [docs/setup.md](docs/setup.md).
- **Plan and requirements:** `openspec/changes/add-expense-tracker-mvp/`.

## Development

```
npm ci
npm run typecheck     # TypeScript
npm test              # unit tests
npm run test:rules    # security rules, on the Firestore emulator (needs Java)
npm run test:e2e      # browser tests against the emulators (needs Chromium: npx playwright install chromium)
npm run emulators     # local Firebase, then in another terminal:
npm run dev -- --mode emulator
```

This repository holds real receipts under `samples/receipts/` and must stay private.
