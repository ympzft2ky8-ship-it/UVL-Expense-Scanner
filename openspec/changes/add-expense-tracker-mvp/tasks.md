# Tasks

## 1. Repository scaffolding

- [ ] 1.1 Create npm workspaces (`apps/web`, `apps/api`, `packages/shared`, `evals/extraction`) with TypeScript strict mode, ESLint, Prettier and Vitest. Verify: `npm run lint`, `npm run typecheck` and `npm test` all pass on the empty skeleton.
- [ ] 1.2 Scaffold `apps/web` with Vite + React + `vite-plugin-pwa` (manifest name "UVL Expenses", icons, standalone display). Verify: `npm run build` produces a manifest and service worker, and Lighthouse reports the app as installable.
- [ ] 1.3 Scaffold `apps/api` as a Cloudflare Worker with `wrangler.toml` bindings for D1 and R2, plus a `GET /api/health` route. Verify: `wrangler dev` responds 200 on `/api/health`.
- [ ] 1.4 Add a CI workflow that runs lint, typecheck and unit tests on every push. Verify: the workflow passes on the branch.

## 2. Shared rules (money, tax, checks, categories)

- [ ] 2.1 Implement integer-cent money helpers and the tax allocation rule (proportional, remainder to the largest taxable line, untaxed lines get $0) in `packages/shared`. Verify: unit tests cover the expense-ledger spec scenarios ($13.31 on $100/$50; the labor/materials invoice), including negative (return) amounts.
- [ ] 2.2 Implement split-line allocation (by amount or percentage) with tax following the same ratio. Verify: unit test for the 50/50 split of a $200 line reconciles to the cent.
- [ ] 2.3 Implement consistency checks a–e from receipt-extraction as pure functions that return flagged fields and plain-language messages. Verify: unit tests for each check, including the "$142.10 vs $124.10" and "receipt from last year" scenarios.
- [ ] 2.4 Encode the category lists, tax treatment labels and property-type rules from expense-categories. Verify: unit tests confirm each property type only accepts its own categories and every category maps to exactly one treatment label.

## 3. Backend: data, auth and sync

- [ ] 3.1 Write D1 migrations for the D8 data model, including sync columns and the `changes` table. Verify: `wrangler d1 migrations apply --local` succeeds and a smoke test inserts and reads each table.
- [ ] 3.2 Add Cloudflare Access JWT verification middleware (signature, audience, issuer) that sets the member email and rejects any request without a valid token. Verify: Worker tests show 401 without a token, 403 for a non-member email and 200 for a member.
- [ ] 3.3 Implement `GET /api/sync?since=` and a `POST /api/mutations` batch endpoint with `base_version` checking and 409 responses. Verify: Worker tests cover create, update, delete (tombstone), stale-version 409, and edits to different rows never conflicting.
- [ ] 3.4 Implement signed R2 upload and download for attachments, restricted to signed-in members. Verify: tests show an unsigned or expired URL is refused.
- [ ] 3.5 Document the one-time Cloudflare setup (D1, R2, Access policy, secrets) in `docs/setup.md` and the `deploy` skill. Verify: following the doc on a fresh Cloudflare account yields a working `/api/health` behind Access.

## 4. App shell, offline store and sync client

- [ ] 4.1 Build the Dexie local store mirroring the D8 tables, plus an outbox. Verify: unit tests show writes land locally and queue a mutation.
- [ ] 4.2 Implement the sync loop: pull on open, focus, pull-to-refresh and every 30 s while visible; push the outbox when online. Verify: a Playwright test with two browser contexts shows a receipt created in one appearing in the other within 60 s.
- [ ] 4.3 Implement the conflict screen (three-way field merge, auto-merging non-overlapping fields, a picker for overlapping ones). Verify: a Playwright test reproduces the "both members edit the same receipt" scenario.
- [ ] 4.4 Add the offline / unsent-changes indicator and the Add-to-Home-Screen hint. Verify: a Playwright test in offline mode shows the indicator with the pending count.
- [ ] 4.5 Manually verify install, sign-in and sync on both members' iPhones and one iPad. Record the results in `docs/device-checks.md`.

## 5. Properties

- [ ] 5.1 Build the property list and the create/edit/archive screens with Rental/Flip type, duplicate-name check and the built-in General / Overhead project. Verify: component tests for each properties-spec scenario.
- [ ] 5.2 Flag affected lines "category needs review" when a property's type changes. Verify: unit test for the Flip→Rental scenario.

## 6. Receipt capture

- [ ] 6.1 Build the Scan button and the camera/import flow (file input with `capture`, photo library, PDF, multi-page "Add page"). Verify: Playwright tests with fixture files for image, multi-page PDF and unsupported file.
- [ ] 6.2 Add OpenCV.js edge detection and perspective correction (lazy-loaded) plus the manual four-corner adjuster. Verify: on 10 angled sample photos, the automatic crop result is visually confirmed, and the manual adjuster works on iPhone.
- [ ] 6.3 Implement blur, glare, dark and too-small quality checks with Retake / Use anyway. Tune thresholds on the sample set. Verify: at least 90% of deliberately bad sample photos are flagged and fewer than 10% of good ones are.
- [ ] 6.4 Build the offline "waiting to read" queue persisted in IndexedDB, with automatic upload and reading when online. Verify: a Playwright offline test shows queued scans survive reload and process on reconnect.
- [ ] 6.5 Add the duplicate-receipt warning (same vendor + date + total, or same vendor + invoice number). Verify: unit and component tests.

## 7. Receipt extraction

- [ ] 7.1 Define the extraction JSON schema and TypeScript types in `packages/shared`, matching the receipt-extraction fields. Verify: typecheck, and the schema validates the example answer keys in `samples/receipts/examples/`.
- [ ] 7.2 Write the extraction system prompt and worked examples per the `receipt-extraction` skill, and implement the Worker call (Anthropic TS SDK, `claude-opus-5`, adaptive thinking, structured output, refusal fallbacks, retries). Verify: a Worker test with a mocked API, then **run the accuracy eval** on the test set and commit the report.
- [ ] 7.3 Implement the targeted re-read when consistency checks fail. Verify: a unit test with a mocked first response that fails check (b), then **run the accuracy eval** and confirm the unflagged-error count does not increase.
- [ ] 7.4 Implement state detection handling (NY suggestion plus confirmation when no state is found) and the "not a receipt" path. Verify: component tests, then **run the accuracy eval**.
- [ ] 7.5 Implement usage cost metering, the monthly cap (default $10), the 80% warning and the Settings display. Verify: Worker tests show a scan is queued with "monthly limit reached" when the cap is hit.
- [ ] 7.6 Build the accuracy eval harness in `evals/extraction` per D10 and the `extraction-eval` skill. Verify: it runs on the sample test set and produces a markdown report with per-field accuracy and the unflagged-error list. The release gate in receipt-extraction is checked from this report.

## 8. Review and editing

- [ ] 8.1 Build the review screen: fields plus image (side-by-side on iPad, toggle on iPhone), needs-check highlights, "N to check" counter with Next, and property pre-selection. Verify: component tests and a check on iPhone and iPad.
- [ ] 8.2 Implement save rules: required date, total, property and confirmed state; the "Save anyway?" confirmation; the "Needs attention" status. Verify: component tests for each expense-review scenario.
- [ ] 8.3 Build editing of saved receipts and lines (add/remove lines, change kind, category or property, live totals) and delete with 30-day "Recently deleted". Verify: component and Playwright tests.
- [ ] 8.4 Build line assignment and split UI (per-line property; split by amount or percentage). Verify: a Playwright test for the two-property store trip.
- [ ] 8.5 Build manual entry and "attach image later". Verify: component test for the $300 cash labor scenario.
- [ ] 8.6 Build search and filters (vendor, description, amount, invoice #, property, category, kind, month, Needs attention, No image). Verify: component tests.

## 9. Categories and vendors

- [ ] 9.1 Implement category suggestion from the model output plus `category_memory` for past choices per vendor. Enforce "no silent default" for repair vs improvement, with the plain-language hint. Verify: unit tests for the "ABC Plumbing" learning and "Water heater" ambiguity scenarios, then **run the accuracy eval** (category suggestions are scored as an informational metric).
- [ ] 9.2 Implement vendor matching (name + address or phone), filling in missing contact details, editing, and merging duplicates. Verify: unit tests for the "THE HOME DEPOT #1234" match and the merge scenario.

## 10. Ledger views

- [ ] 10.1 Build the property summary (totals with and without tax; by category; by labor/materials/other) and the year dashboard (by month, by vendor). Verify: unit tests confirm totals equal the sum of line full costs, including returns.
- [ ] 10.2 Enforce the ledger year rules (closed years refused; January grace routing to the previous open year). Verify: unit tests with a fixed clock.

## 11. Spreadsheet export

- [ ] 11.1 Implement the ExcelJS workbook with all six sheets and columns from spreadsheet-export, using SUMIFS formulas with cached results, real dates and dollar formatting. Verify: a CI test re-reads the file with a second library and compares every summary total to the ledger to the cent.
- [ ] 11.2 Wire the export button to the iOS share sheet, with the unresolved-entries prompt. Verify: manually open one export in Excel, Numbers (iPhone) and Google Sheets. Record the results in `docs/device-checks.md`.
- [ ] 11.3 Write the `xlsx-export` skill's final column reference from the implementation. Verify: the skill matches the generated workbook headers (a test asserts the header list).

## 12. Year-end archive

- [ ] 12.1 Implement archive creation (spreadsheet, images named by date/vendor/receipt ID, JSON data) as a streaming zip on the device, splitting into parts above about 300 MB. Verify: a test builds an archive from a fixture year and checks its contents against the ledger.
- [ ] 12.2 Implement the close-year flow: retention message, "I saved it" confirmation, type-the-year confirmation, clearing on backend and devices, keeping properties, vendors and category memory. Verify: a Playwright test for the cancel and confirm scenarios.
- [ ] 12.3 Implement the 30-day hidden backup with Restore and automatic purge (Worker cron trigger). Verify: Worker tests with a fixed clock.
- [ ] 12.4 Add the weekly "year still open" reminder banner. Verify: component test with a fixed clock.

## 13. Release readiness (integration only)

- [ ] 13.1 Run the full accuracy eval on the test set and confirm the release gate: ≥97% totals, dates and vendors; ≥95% line amounts; 0 unflagged errors on totals, dates and line amounts. Commit the report under `evals/extraction/reports/`.
- [ ] 13.2 Run an end-to-end pilot: both members scan one week of real receipts on their own phones. Log every correction they had to make. Fix any issue that blocks the flow.
- [ ] 13.3 Deploy to production per `docs/setup.md`. Confirm both members are installed and signed in and that an export opens in the accountant's preferred tool.
