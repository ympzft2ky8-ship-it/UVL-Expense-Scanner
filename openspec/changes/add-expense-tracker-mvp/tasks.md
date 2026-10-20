# Tasks

## 1. Repository scaffolding

- [ ] 1.1 Create npm workspaces (`apps/web`, `packages/shared`, `evals/extraction`) with TypeScript strict mode, ESLint, Prettier and Vitest. Verify: `npm run lint`, `npm run typecheck` and `npm test` all pass on the empty skeleton.
- [ ] 1.2 Scaffold `apps/web` with Vite + React + `vite-plugin-pwa` (manifest name "UVL Expenses", icons, standalone display). Verify: `npm run build` produces a manifest and service worker, and Lighthouse reports the app as installable.
- [ ] 1.3 Scaffold `firebase/` (`firebase.json`, `firestore.indexes.json`, empty `firestore.rules` / `storage.rules` that deny all) and install the Firebase CLI as a dev dependency. Verify: `firebase emulators:start` boots the Firestore, Storage and Auth emulators locally.
- [ ] 1.4 Add a CI workflow that runs lint, typecheck and unit tests on every push. Verify: the workflow passes on the branch.

## 2. Shared rules (money, tax, checks, categories)

- [ ] 2.1 Implement integer-cent money helpers and the tax allocation rule (proportional, remainder to the largest taxable line, untaxed lines get $0) in `packages/shared`. Verify: unit tests cover the expense-ledger spec scenarios ($13.31 on $100/$50; the labor/materials invoice), including negative (return) amounts.
- [ ] 2.2 Implement split-line allocation (by amount or percentage) with tax following the same ratio. Verify: unit test for the 50/50 split of a $200 line reconciles to the cent.
- [ ] 2.3 Implement consistency checks a–e from receipt-extraction as pure functions that return flagged fields and plain-language messages. Verify: unit tests for each check, including the "$142.10 vs $124.10" and "receipt from last year" scenarios.
- [ ] 2.4 Encode the category lists, tax treatment labels and property-type rules from expense-categories. Verify: unit tests confirm each property type only accepts its own categories and every category maps to exactly one treatment label.

## 3. Firebase: rules, data model and auth

- [ ] 3.1 Write `firestore.rules` and `storage.rules` implementing the D8 collections and the D3 member-email allowlist (deny by default; allow read/write only to the two hardcoded member emails, with `request.auth.token.email_verified == true`). Verify: a rules-test suite on the Firebase Emulator Suite covers "member can read/write own data" and "non-member and signed-out requests are denied" for every collection.
- [ ] 3.2 Implement the Firestore client wrapper in `packages/shared` (typed collection/document helpers matching D8) and the version-checked save transaction from D4. Verify: unit tests against the emulator cover a clean save, a version-mismatch triggering the conflict path, and a tombstone delete.
- [ ] 3.3 Implement Firebase Authentication email-link sign-in (send link, complete sign-in on link-open, 30+ day persistence) restricted in the UI to the two configured member emails. Verify: emulator-backed tests cover sign-in, a non-member email being refused before a link is even sent, and session persistence across an app restart.
- [ ] 3.4 Implement Storage upload/download for attachments via the Firebase Storage SDK, governed entirely by `storage.rules`. Verify: an emulator test shows a signed-out or non-member read/write is refused.
- [ ] 3.5 Document the one-time Firebase setup (project creation, enabling Auth/Firestore/Storage, deploying rules) in `docs/setup.md` and the `deploy` skill. Verify: following the doc on a fresh Firebase project yields a working emulator-tested rules deploy.

## 4. App shell and sync client

- [ ] 4.1 Initialize the Firestore SDK with offline persistence enabled and wire the D8 collections through the typed wrapper from 3.2. Verify: unit tests show a write made while the emulator is offline is queued and lands once connectivity returns.
- [ ] 4.2 Wire `onSnapshot` listeners for the active year's collections so changes appear live. Verify: a Playwright test with two browser contexts against the emulator shows a receipt created in one appearing in the other within 60 s.
- [ ] 4.3 Implement the conflict screen (three-way field merge, auto-merging non-overlapping fields, a picker for overlapping ones) on top of the D4 version-check transaction retry. Verify: a Playwright test reproduces the "both members edit the same receipt" scenario.
- [ ] 4.4 Add the offline / unsent-changes indicator (from Firestore's pending-writes state) and the Add-to-Home-Screen hint. Verify: a Playwright test in offline mode shows the indicator with the pending count.
- [ ] 4.5 Manually verify install, sign-in and sync on both members' iPhones and one iPad against the real (non-emulated) Firebase project. Record the results in `docs/device-checks.md`.

## 5. Properties

- [ ] 5.1 Build the property list and the create/edit/archive screens with Rental/Flip type, duplicate-name check and the built-in General / Overhead project. Verify: component tests for each properties-spec scenario.
- [ ] 5.2 Flag affected lines "category needs review" when a property's type changes. Verify: unit test for the Flip→Rental scenario.

## 6. Receipt capture

- [ ] 6.1 Build the Scan button and the camera/import flow (file input with `capture`, photo library, PDF, multi-page "Add page"). Verify: Playwright tests with fixture files for image, multi-page PDF and unsupported file.
- [ ] 6.2 Add OpenCV.js edge detection and perspective correction (lazy-loaded) plus the manual four-corner adjuster. Verify: on 10 angled sample photos, the automatic crop result is visually confirmed, and the manual adjuster works on iPhone.
- [ ] 6.3 Implement blur, glare, dark and too-small quality checks with Retake / Use anyway. Tune thresholds on the sample set. Verify: at least 90% of deliberately bad sample photos are flagged and fewer than 10% of good ones are.
- [ ] 6.4 Build the "waiting to read" state on a receipt document, relying on Firestore's own offline queue (D4) to hold the create until the device is back online, plus a visible indicator while a receipt is queued. Verify: a Playwright offline test against the emulator shows a queued scan survive reload and start reading on reconnect.
- [ ] 6.5 Add the duplicate-receipt warning (same vendor + date + total, or same vendor + invoice number). Verify: unit and component tests.

## 7. Receipt extraction

- [ ] 7.1 Define the extraction JSON schema and TypeScript types in `packages/shared`, matching the receipt-extraction fields. Verify: typecheck, and the schema validates the example answer keys in `samples/receipts/examples/`.
- [ ] 7.2 Write the extraction system prompt and worked examples per the `receipt-extraction` skill, and implement the client-side call (Anthropic TS SDK, `claude-opus-5`, adaptive thinking, structured output, refusal fallbacks, retries) using the on-device key from Settings. Verify: a unit test with a mocked API, then **run the accuracy eval** on the test set and commit the report.
- [ ] 7.3 Implement the targeted re-read when consistency checks fail. Verify: a unit test with a mocked first response that fails check (b), then **run the accuracy eval** and confirm the unflagged-error count does not increase.
- [ ] 7.4 Implement state detection handling (NY suggestion plus confirmation when no state is found) and the "not a receipt" path. Verify: component tests, then **run the accuracy eval**.
- [ ] 7.5 Implement usage cost metering against the `usage/{yyyy-mm}` Firestore document, the monthly cap (default $10), the 80% warning, the Settings display, the "Remove AI key from this device" action, and the Anthropic Console hard spend limit as the documented backstop. Verify: emulator-backed tests show a scan is queued with "monthly limit reached" when the cap is hit, and a unit test confirms removing the key blocks automatic reading.
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
- [ ] 12.3 Implement the 30-day hidden backup with Restore, using a Firestore TTL policy on a `purgeAt` field for the automatic purge (no server or scheduled job to run). Verify: an emulator test sets a past `purgeAt` and confirms the backup is gone; a unit test confirms Restore works before `purgeAt`.
- [ ] 12.4 Add the weekly "year still open" reminder banner. Verify: component test with a fixed clock.

## 13. Release readiness (integration only)

- [ ] 13.1 Run the full accuracy eval on the test set and confirm the release gate: ≥97% totals, dates and vendors; ≥95% line amounts; 0 unflagged errors on totals, dates and line amounts. Commit the report under `evals/extraction/reports/`.
- [ ] 13.2 Run an end-to-end pilot: both members scan one week of real receipts on their own phones. Log every correction they had to make. Fix any issue that blocks the flow.
- [ ] 13.3 Deploy to production per `docs/setup.md`. Confirm both members are installed and signed in and that an export opens in the accountant's preferred tool.
