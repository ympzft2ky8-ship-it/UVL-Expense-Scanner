# UVL Expense Scanner

Private expense tracker for Urban Vibes Living LLC. It is a PWA installed on the owners' iPhones and iPads: scan receipts, have Claude read them, review and correct the results, and export one .xlsx per tax year.

## Where to look first

- **Requirements and plan:** `openspec/changes/add-expense-tracker-mvp/`. It contains `proposal.md` (why), `specs/*/spec.md` (behavior contract), `design.md` (architecture decisions D1–D11) and `tasks.md` (implementation checklist). Project context is in `openspec/config.yaml`.
- **OpenSpec workflow:** `/opsx:propose`, `/opsx:apply`, `/opsx:archive` (skills in `.claude/skills/openspec-*`). Any behavior change goes through an OpenSpec change first.
- **Domain skills:**
  - `receipt-extraction`: prompt, schema and reading rules
  - `extraction-eval`: accuracy measurement and the release gate
  - `tax-categories`: categories, repair vs improvement, NY sales tax
  - `xlsx-export`: workbook layout and compatibility
  - `deploy`: Firebase setup and operations

## Ground rules

- Scan accuracy is the top priority. Any change to extraction (prompt, schema, model, effort, image preprocessing) must re-run the eval and include before/after numbers. Running the eval costs money, so ask first.
- Money is integer cents, never floats. Dates are ISO `YYYY-MM-DD`.
- The app organizes records and does not give tax advice. Keep UI copy neutral.
- There is no backend. The Anthropic API key is entered by each member and stored on-device only; never hardcode it or commit it. A hard spend limit on the Anthropic account is the real safety net against a leaked key.
- `samples/receipts/` holds real receipts. The repository must stay private.
- Users are non-technical: write UI text and owner-facing docs in plain language.

## Layout (planned, see design D11)

`apps/web` (PWA, the only app), `packages/shared` (money/tax/checks/categories), `firebase/` (Security Rules and config), `evals/extraction`, `samples/receipts`, `docs/`.
