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
  - `deploy`: Cloudflare setup and operations

## Ground rules

- Scan accuracy is the top priority. Any change to extraction (prompt, schema, model, effort, image preprocessing) must re-run the eval and include before/after numbers. Running the eval costs money, so ask first.
- Money is integer cents, never floats. Dates are ISO `YYYY-MM-DD`.
- The app organizes records and does not give tax advice. Keep UI copy neutral.
- The Anthropic API key lives only in the Worker secret. Never commit secrets or put the key in client code.
- `samples/receipts/` holds real receipts. The repository must stay private.
- Users are non-technical: write UI text and owner-facing docs in plain language.

## Layout (planned, see design D11)

`apps/web` (PWA), `apps/api` (Cloudflare Worker), `packages/shared` (money/tax/checks/categories), `evals/extraction`, `samples/receipts`, `docs/`.
