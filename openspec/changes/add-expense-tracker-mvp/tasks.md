# Tasks

Checked items are built and verified by the automated tests named in each line. Unchecked items need the owners' accounts, real phones or real receipts.

## 1. Repository scaffolding

- [x] 1.1 npm workspaces (`apps/web`, `packages/shared`, `evals/extraction`) with strict TypeScript and Vitest. Verified: `npm run typecheck` and `npm test` pass.
- [x] 1.2 `apps/web` with Vite, React and `vite-plugin-pwa` (name "UVL Expenses", icons, standalone display). Verified: `npm run build` writes the manifest and service worker.
- [x] 1.3 `firebase/` with `firebase.json`, rules and emulator settings. Verified: `npm run test:rules` starts the Firestore emulator.
- [x] 1.4 CI workflow running typecheck, unit tests, rules tests and the build on every push. Verified locally with the same commands; first run on GitHub still to be watched.

## 2. Shared rules (money, tax, checks, categories)

- [x] 2.1 Integer-cent money helpers and tax allocation. Verified: `packages/shared/test/money.test.ts` (spec scenarios, returns, discounts).
- [x] 2.2 Split-line allocation with tax in the same ratio. Verified: `misc.test.ts` 50/50 split.
- [x] 2.3 Consistency checks a–e with plain-language messages. Verified: `checks.test.ts`.
- [x] 2.4 Category lists, tax treatment labels, per-vendor category memory. Verified: `misc.test.ts`.

## 3. Firebase: rules, data and sign-in

- [x] 3.1 `firestore.rules` restricting every collection to the two members' verified emails. Verified: `firebase/firestore.rules.test.ts` (29 cases on the emulator).
- [x] 3.2 Version-checked save with three-way merge, and the outbox for offline edits (`apps/web/src/store.ts`). Verified: e2e "both edit the same receipt" and "an edit made offline waits, then syncs".
- [x] 3.3 Email + password sign-in with one-time email confirmation. Verified: e2e non-member, unverified-member and member sign-in tests.
- [x] 3.4 Receipt images stored in Firestore in pieces under the size limit (`blobs.ts`). Verified: `image.test.ts` chunk round-trip; e2e image viewer and archive tests.
- [x] 3.5 Owner setup guide `docs/setup.md` and the `deploy` skill. Verification still owed: follow it once on the owners' real Firebase project (13.3).

## 4. App shell and sync

- [x] 4.1 Firestore with offline cache and live listeners. Verified: e2e "new ones arrive on their own".
- [x] 4.2 Conflict dialog (auto-merge different fields, choose for the same field). Verified: e2e conflict test.
- [x] 4.3 Offline / waiting-to-sync indicator and Add-to-Home-Screen hint. Verified: e2e offline test (indicator); hint is iOS-only and needs a device check.
- [ ] 4.4 Install, sign in and sync on both members' iPhones and one iPad. Record results in `docs/device-checks.md`.

## 5. Properties

- [x] 5.1 Property list, create/edit/archive/delete rules, duplicate-name check, built-in General / Overhead. Verified: e2e property tests.
- [x] 5.2 Changing a property's type clears and flags its categories. Verified: e2e "changing a property from flip to rental".
- [x] 5.3 Property summary by category and labor/materials/other. Verified: e2e split test totals.

## 6. Receipt capture

- [x] 6.1 Scan button (camera), photo/PDF import, multi-page, unsupported-file message. Verified: e2e import flow; camera itself needs a device check.
- [x] 6.2 Blur, dark, glare and too-small checks with retake or use anyway. Verified: `image.test.ts`. Thresholds to be tuned on real photos (7.6).
- [x] 6.3 Scans made offline are kept and read once online, by one phone only. Verified: e2e "a scan made offline".
- [x] 6.4 Duplicate-receipt warning. Verified: unit test and e2e "scanned twice".
- [ ] 6.5 (Deferred to a later change) Automatic edge detection and straightening.

## 7. Receipt reading

- [x] 7.1 Output schema and types. Verified: `extract.test.ts` schema test.
- [x] 7.2 Reading prompt and API call (`claude-opus-5-5`, adaptive thinking, structured output, refusal fallbacks). Verified with a stand-in API: `extract.test.ts` and e2e. **Accuracy eval not yet run** (needs sample receipts and an API key).
- [x] 7.3 One targeted re-read when the numbers do not add up. Verified: `extract.test.ts`, e2e "re-read once, then flagged". Accuracy eval owed as above.
- [x] 7.4 State handling (NY suggested and confirmation required when not found) and not-a-receipt path. Verified: e2e "no address asks for the state".
- [x] 7.5 Cost metering, monthly cap, 80% warning, key entry and removal. Verified: e2e "monthly limit" and "removing the AI key".
- [x] 7.6 Eval harness and report with the release gate (`evals/extraction`). Verified: `score.test.ts`.
- [ ] 7.7 Owners upload 20–30 sample receipts; answer keys drafted and confirmed; **run the accuracy eval** and commit the report; tune photo thresholds and prompt if the gate is not met, re-running the eval after each change.

## 8. Review and editing

- [x] 8.1 Review screen with image beside the fields (side by side on iPad, one tap on iPhone), highlights, "N to check" and Next. Verified: e2e scan test.
- [x] 8.2 Save rules: date, total, property and confirmed state required; "Save anyway?"; Needs attention. Verified: e2e.
- [x] 8.3 Edit saved receipts, add/remove lines, delete with 30-day restore. Verified: e2e delete/restore.
- [x] 8.4 Per-line property and splits by percent or amount. Verified: e2e split test.
- [x] 8.5 Manual entry, attach image later. Verified: e2e cash payment test (attach-later not covered by a test).
- [x] 8.6 Search and filters with matching-line totals. Verified: e2e search test.

## 9. Categories and vendors

- [x] 9.1 Suggestions from the reader and from past choices per vendor; repair-vs-improvement never defaulted. Verified: unit tests, e2e water-heater case.
- [x] 9.2 Vendor directory: matching, filling missing contact details, edit, merge. Verified: unit tests, e2e vendors test.

## 10. Ledger views

- [x] 10.1 Year totals, by month, by vendor, by property. Verified: `misc.test.ts` ledger tests, e2e totals.
- [x] 10.2 Year rules: closed year refused, last year open until closed. Verified: e2e close-year test.

## 11. Spreadsheet export

- [x] 11.1 Six-sheet workbook with SUMIFS formulas and cached results. Verified: `workbook.test.ts` (totals to the cent, raw-file check), e2e export test.
- [ ] 11.2 Open one export in Excel, Numbers on iPhone and Google Sheets; check the iOS share sheet. Record in `docs/device-checks.md`.

## 12. Year-end archive

- [x] 12.1 Archive zip: spreadsheet, images named to match the Receipt ID column, data file. Verified: e2e archive tests.
- [x] 12.2 Close-year flow: retention note, "I saved it", type the year, clear. Verified: e2e close-year test.
- [x] 12.3 30-day restore of a cleared year and purge when the app opens. Verified: e2e restore. The purge itself is not covered by a test.
- [x] 12.4 "Last year is still open" reminder. Verified: e2e close-year test.

## 13. Release readiness

- [ ] 13.1 Accuracy gate met on the test set (≥97% totals, dates, vendors; ≥95% line amounts; 0 unflagged errors). Report committed.
- [ ] 13.2 One-week pilot on both phones with real receipts; log every correction.
- [ ] 13.3 Deploy to the owners' Firebase project per `docs/setup.md`; both members installed and signed in.
