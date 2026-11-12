# Design

## Context

See proposal.md for the motivation and specs/ for the required behavior. Constraints that shape the design:

- Two users, about 20 receipts a month, iPhone and iPad Safari. No Mac and no paid Apple developer account, so the app is a Progressive Web App.
- **No backend the owners operate, and no credit card for hosting.** Whatever stores and syncs data must be a managed, free service.
- Accuracy of reading is the top priority.
- Users are not technical.

This document describes the design as built. Five points of the earlier plan were changed during the pre-build review; each is marked **(revised)** with the reason.

## Goals / Non-Goals

**Goals:**
- One TypeScript codebase: the app, and shared rules (money math, consistency checks, categories, the reading prompt) that the accuracy eval also uses.
- Offline-first, with a sync model sized for two users.
- Reading accuracy measured by a repeatable eval.

**Non-Goals:**
- Native iOS app, App Store distribution, Face ID lock.
- Any server the owners run (no Workers, containers, NAS or Cloud Functions).
- Automatic edge detection and perspective straightening of photos (deferred, see D5).
- Multi-currency, more than two users, mileage, income, 1099 reporting.
- Direct Google Drive or Sheets integration. The iOS share sheet covers saving to Drive.

## Decisions

### D1. Progressive Web App with React + Vite + TypeScript
- `vite-plugin-pwa` provides the manifest, offline shell and asset caching.
- Alternatives: native SwiftUI needs the $99/yr Apple program or a Mac with weekly reinstalls; Capacitor/React Native still need Xcode.

### D2. Firebase on the free Spark plan: Hosting, Firestore and Authentication only (revised)
- **Firebase Hosting** serves the built app. **Firestore** holds all data, including receipt images. **Firebase Authentication** handles sign-in.
- **Revised: Firebase Storage is not used.** New Firebase projects can only use Cloud Storage on the paid Blaze plan, which needs a credit card. Receipt images and PDFs are stored in Firestore instead, cut into pieces of at most 700 KB (Firestore's document limit is 1 MiB) in a `blobs` collection. At about 20 receipts a month this is roughly 100 MB a year against a 1 GiB free allowance.
- Alternatives: Cloudflare Workers/D1/R2 and a self-hosted NAS were dropped when the owners ruled out running a backend. Supabase pauses free projects after a week idle.

### D3. Sign-in with email and password, email verified once; Security Rules enforce membership (revised)
- A member creates an account with email and password, then confirms the address once by opening a link Firebase emails them. The link can be opened in any browser.
- **Firestore Security Rules** allow reads and writes only to a signed-in user whose **verified** email is one of the two member addresses written in `firebase/firestore.rules`. Everything else is refused by Firebase itself, whatever the client sends. An account registered with a member's address by someone who cannot open that inbox stays unverified and gets nothing.
- **Revised: not the email-link ("magic link") sign-in.** On iOS a link from Mail opens in Safari, which does not share storage with the home-screen app, so the sign-in would complete in the wrong place. The free plan also limits sign-in emails to a handful per day. Email and password works inside the installed app, iOS Keychain remembers the password, and the device stays signed in.
- Alternatives: custom claims need a server to set them. A one-time numeric code needs a Cloud Function to send it.

### D4. Sync: Firestore listeners and offline cache, plus version checks and a small outbox for conflicts (revised)
- Firestore's persistent local cache serves reads offline and queues **new** records (scans, images, manual entries) until the device reconnects. Real-time listeners deliver changes to the other phone within seconds.
- Every record carries `version`, `updatedAt`, `updatedBy`. A change to an **existing** record is saved in a Firestore transaction that only writes if the stored `version` still equals the version the edit started from.
- On a mismatch the app does a three-way merge (base / mine / theirs): fields only one side changed merge automatically; fields both changed are shown to the member to choose. A form that is open but untouched simply refreshes to the newer version.
- **Revised: a small outbox.** Firestore transactions cannot run offline, and its plain offline writes are last-write-wins. Edits to existing records made offline are therefore kept in a local outbox (with the version they started from), shown on top of the cached data, and committed through the same version-checked transaction on reconnect. So an offline edit can still surface a conflict instead of silently overwriting.
- A waiting scan is claimed in a transaction before it is read, so two phones never read the same scan.

### D5. Capture on the device (revised scope)
- `<input type="file" capture="environment">` opens the native iOS camera at full resolution. The same input without `capture` imports photos and PDFs. Several pages can be added to one receipt.
- Photos are scaled to a long edge of 2200 px and saved as JPEG. Blur (variance of the Laplacian), darkness and glare are measured on a small grayscale copy; a failed check offers retake or use anyway.
- Very tall receipts (taller than 3× their width) are sent to the reader as overlapping segments.
- PDFs up to 8 MB are stored and sent to the reader as PDF documents.
- **Revised: automatic edge detection and straightening are deferred.** They would need OpenCV.js (about 8 MB) and tuning against real photos. The reader copes with angled photos and background, and the iPhone Notes "Scan Documents" PDF import gives a straightened scan when wanted. This can be added later as its own change.

### D6. Reading: Claude called from the phone, structured output, deterministic checks, one targeted re-read
- **Where:** there is no backend, so the app calls the Anthropic API directly. **Revised: the API key is saved once in the members-only settings record** (protected by the D3 rules and synced to both phones), so it is not typed on every device. It is never in the code or the repository. The trade-off stands: the key is reachable from a signed-in member's device. Mitigations: a hard monthly spend limit on the Anthropic account (the real backstop), the in-app monthly cap, key rotation in the Anthropic console, and a "Remove key" action.
- **Request** (official TypeScript SDK): model **`claude-opus-5-5`** (revised from `claude-opus-5`: it is the current Opus, and cheaper at $4 / $20 per million tokens), adaptive thinking, effort `high`, `output_config.format` with a JSON schema, and server-side refusal fallbacks (`fallbacks: "default"`).
- **Prompt and schema** live in `packages/shared/src/extraction/`. The reader returns header fields, line items, receipt-level charges, per-line labor/materials/other, a category suggestion for each property type (the property is chosen after reading), a repair-vs-improvement-unclear flag, and low-confidence markers.
- **Checks:** the arithmetic and plausibility checks (a–e in the spec) are pure functions in `packages/shared` and always override the reader's own confidence.
- **Targeted re-read:** when an arithmetic check fails, one follow-up request states the discrepancy. The second reading is kept only if it adds up.
- **Cost:** each response's token usage is priced from a table and added to `usage/{yyyy-mm}`; the cap is checked before each read. About $0.03–0.07 per receipt.

### D7. Money and tax math
- Integer cents everywhere. Tax is allocated to taxable lines in proportion, rounded to the cent, with leftover cents to the largest line. Splits share a line's tax in the same ratio.

### D8. Data model (Firestore) (revised)
- `properties/{id}`, `vendors/{id}` (with per-property-type category counts used for suggestions), `yearMeta/{year}`, `config/app` (AI key, cap, model, last property), `usage/{yyyy-mm}`.
- `receipts/{id}`: header fields, `ledgerYear`, `status` (`queued | reading | toReview | saved | failed`), `flags`, `deletedAt`, and **the line items embedded as an array** (revised from a subcollection). A receipt is then saved atomically under one version, which keeps conflict detection simple; even a 200-line receipt is far below the document size limit.
- `blobs/{receiptId}_{page}_{chunk}`: image pieces (D2).
- **Revised: the 30-day windows are purged by the app when it opens**, not by Firestore TTL policies. Deleted receipts and cleared years are hidden at once and removed for good after 30 days.

### D9. Spreadsheet export on the device with ExcelJS
- Only `SUM` and `SUMIFS` formulas, each written with its cached result. Real dates, dollar formats. The library is loaded only when an export is made.

### D10. Accuracy eval harness
- `evals/extraction/run.ts` runs the app's own reading code over `samples/receipts/test/` and writes a markdown report: per-field accuracy, every wrong value, and the wrong-and-not-flagged count that gates a release. It calls the paid API, so it is run deliberately.

### D11. Repository layout
```
apps/web          the app (React PWA)
packages/shared   money, tax, checks, categories, ledger rows, reading prompt/schema/call
evals/extraction  accuracy eval
firebase/         firestore.rules, rules tests, firebase.json
e2e/              end-to-end browser tests (Playwright, against the Firebase emulators)
samples/receipts  private sample receipts and answer keys
docs/setup.md     owner setup guide
```

## Risks / Trade-offs

- **[The AI key is reachable from a member's device]** → hard spend limit on the Anthropic account, in-app cap, rotation, "Remove key".
- **[Security Rules are the only access control]** → `npm run test:rules` covers every collection for members, non-members, unverified and signed-out users, and runs in CI.
- **[Member emails are written in the rules file]** → the repository is private; changing a member means editing two lines and redeploying the rules.
- **[No automatic straightening]** → retake prompt on poor photos, Notes PDF scan as fallback, deferred feature.
- **[Images in Firestore]** → fine at this volume; if volume grew tenfold, move images to Cloud Storage (needs Blaze).
- **[iOS may evict website storage]** → home-screen apps are exempt from the 7-day rule; the server holds everything except unsent changes, which the app shows as "waiting to sync".
- **[AI misreads that pass all checks]** → mandatory review, the eval's unflagged-error gate.
- **[Tax labels are not tax advice]** → neutral wording, note in the app and the export.

## Migration Plan

Greenfield. Deployment is described for the owners in `docs/setup.md`: create the Firebase project, turn on email/password sign-in and Firestore, put the two member emails into the rules, deploy rules and hosting, create accounts, enter the AI key. Rollback: `firebase hosting:rollback`.

## Open Questions

- Image long-edge size and blur/glare thresholds, to be tuned once real sample receipts exist.
- Whether `claude-sonnet-5-5` reads as accurately at half the cost: decided by the eval, and by the owners.
- Whether to add a Cloud Function proxy later to keep the AI key off devices (needs the Blaze plan).
