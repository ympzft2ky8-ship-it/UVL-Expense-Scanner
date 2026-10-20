# Design

## Context

The repository is empty (greenfield). See proposal.md for the motivation and specs/ for the required behavior. Constraints that shape the design:

- Two users, about 20 receipts a month, iPhone and iPad Safari. No Mac and no paid Apple developer account, so the app is a Progressive Web App.
- **No backend the owners operate.** Whatever stores and syncs data must be a managed, free service with nothing to patch, back up or pay for as infrastructure.
- Accuracy of reading is the top priority. Everything else is secondary to "don't frustrate the user with wrong data".
- Users are not technical: there are no servers to administer and no manual database work.

## Goals / Non-Goals

**Goals:**
- One TypeScript codebase for the app and the shared rules (money math, consistency checks, categories), used by both the app and the accuracy eval.
- An offline-first client with a simple, predictable sync model sized for two users, built on an existing offline/sync engine rather than a hand-written one.
- An extraction pipeline whose accuracy is measured by a repeatable eval, not by impression.

**Non-Goals:**
- Native iOS app, App Store distribution, Face ID lock.
- Any server the owners run or deploy to themselves (no Workers, no containers, no NAS, no Cloud Functions - see D2, D3, D6).
- Real-time collaborative editing (live cursors, field-level merge UI beyond what's needed to avoid silent overwrites). Two users editing minutes apart is the design target, not two people typing in the same field at once.
- Multi-currency, multi-company, more than two users, mileage tracking, income tracking, 1099 reporting. Each of these can be a later change.
- Direct Google Drive or Google Sheets API integration. The iOS share sheet covers saving to Drive.

## Decisions

### D1. Progressive Web App with React + Vite + TypeScript
- **Choice:** React + Vite + TypeScript, with `vite-plugin-pwa` (Workbox) for the manifest, offline shell and asset caching.
- **Why:** it installs to the home screen, works offline, runs on iPhone, iPad and Android, and needs no Mac.
- **Alternatives:**
  - Native SwiftUI: needs either a $99/yr Apple developer account (for lasting installs, TestFlight and iCloud sync) or a Mac plus reinstalling every 7 days on a free account. The owners ruled out both.
  - Capacitor/React Native: still need Xcode to ship to iOS, so the same problem as native.
  - SvelteKit/Vue: viable, but React has the widest library support for the pieces we need (camera handling, spreadsheet writing).

### D2. Firebase (free Spark plan) for hosting, data and file storage - no server the owners run
- **Choice:**
  - **Firebase Hosting** serves the built PWA over HTTPS (a free `*.web.app` subdomain, or a custom domain later).
  - **Firestore** holds all app data (see D8).
  - **Firebase Storage** holds receipt images and PDFs.
  - All three are Google-run managed services on the free **Spark** plan: no credit card, no server to patch, nothing that pauses after a week of inactivity.
- **Why:** this is the closest thing available to "no servers or clouds we manage" while still giving two phones a shared, synced store. Nothing is self-hosted; nothing needs a Mac, a NAS, or a paid Apple developer account.
- **Alternatives:**
  - Cloudflare Workers + D1 + R2 (the previous design): required a hand-written sync protocol, auth-token verification code, and a Worker with a CPU-time limit. Dropped once the owners decided against running any backend at all.
  - Self-hosting on the owners' QNAP NAS: dropped for the same reason - it is still a server the owners would maintain, back up and secure.
  - Supabase: free projects pause after a week of inactivity, which is a real risk at ~20 receipts/month.
  - iCloud/CloudKit only: would need the $99/yr Apple developer program, which the owners ruled out.

### D3. Sign-in with Firebase Authentication (email link), enforced by Security Rules
- **Choice:**
  - Firebase Authentication's passwordless **email link** sign-in: a member enters their email address, Firebase sends a sign-in link to it, and tapping that link on a device signs them in there. No password to create or remember.
  - **Firestore and Storage Security Rules** allow reads and writes only when the signed-in user's verified email matches one of the two member addresses, which are written directly into the rules files (membership is fixed at two people, so there is no admin screen for it). Anyone else's Firebase account is refused by the rules themselves, before any app code runs.
  - Firebase keeps a device signed in for 30+ days by default; no custom session code is written.
- **Why:** this needs no server at all - no token-verification middleware, no session store, no Cloud Function to run. Security Rules are enforced by Firebase itself regardless of what the client sends, so a compromised or modified client still can't read or write another member's data or anyone else's.
- **Alternatives:**
  - A typed one-time numeric code (the original Cloudflare Access design): Firebase's native passwordless flow is a tap-the-link flow, not a typed code. Reproducing a typed code would need a Cloud Function to generate and email it, which reintroduces a server. The link flow meets the same goal - no password, restricted to known emails - with zero extra infrastructure, so the "Member signs in" scenario in access-and-sync is written around a sign-in link rather than a code.
  - Custom claims via the Admin SDK: setting them requires a server or Cloud Function. Hardcoding the two emails directly in Security Rules avoids that and is simple precisely because membership never changes dynamically.

### D4. Sync: Firestore's built-in offline persistence, with app-level optimistic locking for conflict detection
- **Choice:**
  - The Firestore client SDK runs with offline persistence turned on. It keeps a local cache (backed by IndexedDB), serves every read instantly from that cache, queues writes made while offline, and replays them automatically once the device reconnects - this is Firestore's own mechanism; no outbox table or queue is written by hand.
  - Real-time listeners (`onSnapshot`) on each collection push changes to the other phone within seconds of either device being online, well inside the spec's 1-minute requirement, with no polling loop to maintain.
  - Every syncable document carries `version` (integer), `updatedAt`, `updatedBy`. Saving a change runs inside a **Firestore transaction**: it reads the current `version`, writes only if it still matches the version the edit started from, and increments it on success.
  - When the transaction's version check fails, the client re-reads the latest document, diffs it field-by-field against the member's edit and the version they started from, auto-merges any field only one side touched, and shows the member a picker for fields both sides touched - the same behavior access-and-sync requires, implemented as a client-side transaction retry rather than a server endpoint.
- **Why:** Firestore's offline queue and listeners remove almost all of the custom sync code a hand-rolled backend would need (no outbox table, no `/api/sync` cursor, no `409` endpoint to implement and test). The transaction-based version check is the one piece Firestore doesn't do automatically, because its own default behavior is last-write-wins per field, which would violate "never silently overwrite a concurrent edit."
- **Alternatives:**
  - Plain Firestore writes with no version check: rejected - that is exactly the silent overwrite the spec forbids.
  - A Cloud Function to arbitrate conflicts centrally: unnecessary, since the transaction runs correctly from the client; it would also force the Firebase project onto the paid Blaze plan (see D6) for no real benefit at this scale.
  - CRDT libraries (Yjs/Automerge): still overkill for two users and form-like records.

### D5. Capture pipeline on the device
- **Camera:** `<input type="file" accept="image/*,application/pdf" capture="environment">` opens the native iOS camera at full resolution. `getUserMedia` gives a live preview but only video-frame resolution, which is worse for small receipt text. The same input without `capture` covers importing from Photos and Files.
- **Straightening:**
  - OpenCV.js runs edge and contour detection followed by a perspective warp. It is lazy-loaded only on the capture screen and cached by the service worker, so the roughly 8 MB download happens once.
  - Manual four-corner adjustment is always available and is the fallback.
- **Quality checks:** variance of the Laplacian for blur, a highlight-clipping ratio for glare, mean luminance for darkness, and estimated text height relative to image size for "too far away". Thresholds are tuned against the sample set.
- **Output:** a straightened JPEG (quality about 0.85) is stored. The long edge is capped at a size the eval shows is sufficient. Very tall receipts, with an aspect ratio above about 3:1, are sent to the model as overlapping segments so text isn't shrunk below legibility.
- **PDFs:** stored and sent to the model as PDF documents. pdf.js is used only to render thumbnails.
- **Offline queue:** captured files are written straight to Firebase Storage and Firestore through the normal SDK calls; Firestore's offline queue (D4) is what holds them while offline and sends them once the device reconnects, so there is no separate hand-written capture queue.

### D6. Extraction: Claude called directly from the phone, structured output, deterministic checks, one targeted re-read
- **Where the call happens:** there is no backend, so the installed app calls the Anthropic API directly from the phone. A member enters their Anthropic API key once in Settings; it is stored in the browser's own storage (IndexedDB), never in application code or source control. This is a real trade-off against a server-mediated design where the key never leaves a backend:
  - **Risk:** a stolen or unlocked phone, or someone inspecting the installed app's local storage, could read the key.
  - **Mitigation:** a monthly spend cap is enforced both in-app (tracked cost, see below) and - the real backstop, since it can't be bypassed by anything running on the phone - as a hard spend limit set on the Anthropic Console account itself. The key can be revoked and replaced from the Anthropic Console in seconds. Settings has a "Remove AI key from this device" action (see access-and-sync).
  - **Alternative considered and rejected for now:** a Firebase Cloud Function that proxies the call so the key stays server-side. Cloud Functions require upgrading the Firebase project to the paid **Blaze** (pay-as-you-go) plan - actual usage cost would stay near $0 at this volume, but Blaze requires a credit card on the project, which the owners want to avoid. This can be revisited later without changing any spec; it only changes where D6's call is made.
- **Request:** the app calls the Anthropic Messages API with the official TypeScript SDK (`@anthropic-ai/sdk`):
  - model `claude-opus-5`, adaptive thinking, effort `high`;
  - `output_config.format` set to a JSON schema, so the response is always valid, typed JSON;
  - server-side refusal fallbacks enabled (`fallbacks: "default"`, per current API guidance).
- **Prompt:**
  - a fixed system prompt with the reading rules: never invent values, state from the address, labor/materials/other definitions, NY tax notes, and the repair-vs-improvement hint;
  - 2–3 worked examples (image plus expected JSON) drawn from the "examples" split of the sample set, never from the test split.
- **Output schema:**
  - header fields and lines, each with `confidence: "high" | "low"`;
  - an `is_receipt` flag;
  - per line: `taxed: true | false | null`, `kind: "labor" | "materials" | "other"`, `suggested_category`, and `category_is_clear`.
- **Deterministic checks:** the consistency checks from the spec (a–e) live in `packages/shared` and run entirely client-side (and in the eval harness, which imports the same module). The model's self-reported confidence is only one input. Arithmetic failures always override it.
- **Targeted re-read:** if any arithmetic check fails, the app makes one follow-up request. It includes the same image and the specific discrepancy (for example, "lines sum to $142.10 but you read subtotal $124.10; re-read the subtotal and each line amount"). The second result is kept only if it resolves the discrepancy. Otherwise the fields stay needs-check. This costs extra only on the minority of receipts that fail checks, and it fixes the most common failure (a single misread digit).
- **Cost metering:** each response's `usage` is priced with a price table bundled in the app and added to a monthly total stored in Firestore (`usage/{yyyy-mm}`). The cap is checked before each call.
- **Why:** accuracy comes first, so the most capable model plus arithmetic verification is worth about $0.05–0.10 per receipt at 20 receipts a month. The eval (D10) decides whether a cheaper model (for example `claude-sonnet-5`) is equally accurate. Switching is then a one-line config change, and the owners make that call.
- **Alternatives:**
  - On-device OCR (Tesseract.js) with rules: much worse on line items, faded thermal paper and handwriting.
  - Dedicated receipt OCR APIs (e.g. Veryfi, Mindee): per-document pricing at our volume is similar or higher, and they can't do our labor/materials and repair-vs-improvement classification.

### D7. Money and tax math
- All amounts are integer cents in Firestore and in the code. Tax rates are stored as basis points ×100 (e.g. 8.875% → 88750).
- Tax allocation follows the expense-ledger spec: proportional shares rounded to the cent, with any remainder given to the largest taxable line. It is implemented once in `packages/shared` and unit-tested with the spec scenarios.
- A split line stores its share as either an amount or a percentage. The line's tax share is split in the same ratio, with the same remainder rule.

### D8. Data model (Firestore collections)
- **`properties/{propertyId}`**: `name, type (rental|flip|overhead), address fields, purchaseDate, saleDate, inServiceDate, archivedAt, version, updatedAt, updatedBy`
- **`vendors/{vendorId}`**: `name, normalizedName, address fields, phone, email, website, mergedInto, version, updatedAt, updatedBy`
- **`years/{year}/receipts/{receiptId}`**:
  - `date, vendorId, invoiceNo`
  - `subtotalCents, taxCents, totalCents, taxState, taxRateBp`
  - `paymentMethod, paymentRef, propertyId` (default for lines)
  - `status (queued|reading|toReview|saved), needsAttention, fieldFlags (map), extractionRaw (map), notes`
  - `version, updatedAt, updatedBy, deletedAt` (tombstone for the 30-day "Recently deleted")
- **`years/{year}/receipts/{receiptId}/lines/{lineId}`** (subcollection, so a long receipt never approaches Firestore's 1 MiB document limit): `position, description, sku, qty, unitPriceCents, amountCents, taxed, taxCents, kind, category, categoryFlag, splits` (a small array of `{propertyId, amountCents | percentBp}`, empty meaning the whole line follows the receipt's property)
- **`years/{year}/receipts/{receiptId}/attachments/{n}`**: `storagePath, mime, page, bytes` - the bytes themselves live in Firebase Storage at `receipts/{year}/{receiptId}/{n}`
- **`categoryMemory/{vendorId}_{propertyType}`**: `category, count` - used for suggestions
- **`usage/{yyyy-mm}`**: `costMicrodollars, capMicrodollars`
- **`yearMeta/{year}`**: `status (open|closed), archivedAt, backupUntil`
- All syncable documents carry the D4 sync fields (`version, updatedAt, updatedBy`, and `deletedAt` where soft-delete applies).
- The 30-day "Recently deleted" and "hidden year backup" windows use **Firestore TTL policies** (a native field-based auto-delete, no Cloud Function needed): a `purgeAt` timestamp field triggers Firestore's own background deletion once it passes.

### D9. Spreadsheet export generated on the device with ExcelJS
- **Choice:** ExcelJS runs in the browser, so export works offline.
- **Why:**
  - SheetJS Community Edition cannot write cell styles.
  - There is no server to run it on in any case, so it must run on the device regardless.
- **Compatibility rules for Excel, Numbers and Google Sheets:**
  - Use only `SUM` and `SUMIFS` formulas.
  - No pivot tables, Excel tables, dynamic arrays, macros or conditional-format rules beyond basic fills.
  - Dates are real date cells and currency uses the `"$"#,##0.00` format.
  - Every formula also carries its **cached result**, because iOS Quick Look and some importers display cached values without recalculating.
- **Verification:** exported files are checked in CI by re-opening them with a second library and comparing each summary total to the ledger. They are opened manually in Numbers and Google Sheets before release.

### D10. Accuracy eval harness
- **Files:** `evals/extraction/` holds a Node script that runs the exact production prompt and schema module over `samples/receipts/test/*`, calling the Anthropic API directly (the same client code path the app uses, extracted into `packages/shared`). Each sample has a `<id>.expected.json` answer key.
- **Scoring:**
  - money exact to the cent; dates exact;
  - vendor name matched case-insensitively and ignoring punctuation and store numbers;
  - lines matched by amount plus description similarity.
- **Report:** per-field accuracy, a list of wrong values, and a list of **wrong-and-not-flagged** values (the metric that matters most, since those reach the ledger unnoticed). It is written as a markdown report so two versions can be compared side by side.
- **Cost:** a full run of 30 receipts costs about $2–3, so runs are deliberate: before a release, or when the prompt, model or image pipeline changes. They are not run on every commit.
- **Split:** samples are divided into `examples/` (used in the prompt, never scored) and `test/` (scored, never shown to the model). This keeps the scores honest.

### D11. Repository layout
```
apps/web          PWA (React) - the only app; calls Firebase and Anthropic directly
packages/shared   money math, tax allocation, checks, categories, schema types
evals/extraction  accuracy eval harness (Node, calls Anthropic directly)
samples/receipts  private sample receipts and answer keys
firebase/         firestore.rules, storage.rules, firebase.json, firestore.indexes.json
openspec/         specs and changes
.claude/skills/   project skills for Claude Code
```
The project uses npm workspaces, Vitest for unit tests, Playwright for end-to-end tests with WebKit (the engine closest to iOS Safari), and the **Firebase CLI** (`firebase deploy`, and the **Firebase Local Emulator Suite** for local development and for testing Security Rules without touching the real project).

## Risks / Trade-offs

- **[The AI key lives on each phone, not behind a server]**
  → Mitigation: a hard spend limit on the Anthropic Console account (the real backstop), an in-app monthly cap, easy key rotation from the Console, and a "remove key from this device" action in Settings.
- **[Security Rules are the only access control - a mistake there is a real exposure]**
  → Mitigation: a rules-test suite (using the Firebase Emulator Suite) mirrors every access-and-sync scenario and runs in CI before every deploy of `firestore.rules` / `storage.rules`.
- **[File-input camera has no live framing guide]**
  → Mitigation: automatic crop, quality checks with retake, manual corner adjustment, and the Notes "Scan Documents" PDF import as a high-quality fallback.
- **[iOS may evict website storage]** Firestore's offline cache lives in IndexedDB like any other site data.
  → Mitigation: home-screen PWAs are exempt from Safari's 7-day eviction; show an "unsent changes" indicator from Firestore's own pending-writes state and sync immediately when online.
- **[AI misreads that pass all checks]** For example, a wrong date or a wrong vendor phone.
  → Mitigation: mandatory review screen, eval tracking of wrong-and-not-flagged fields, and the release gate in receipt-extraction.
- **[Large archive in phone memory]** About 150 MB of images a year when zipped on an iPhone.
  → Mitigation: store images uncompressed in the zip (JPEG is already compressed) and use a streaming zip writer. If the archive exceeds about 300 MB, split it into numbered parts.
- **[AI price or model changes]**
  → Mitigation: the price table and model ID live in app config, the monthly cap limits exposure, and the eval re-validates any model change.
- **[Tax categorization is not tax advice]**
  → Mitigation: labels are phrased as organizing aids, with a disclaimer in the app and the export. The accountant reviews the export.

## Migration Plan

Greenfield, so there is no data migration. Deployment order:
1. The owners create a Firebase project (free **Spark** plan - no credit card) and an Anthropic API account with prepaid credits and a hard spend limit.
2. The Firebase CLI (`firebase init`) sets up Hosting, Firestore and Storage in the project; `firebase deploy --only firestore:rules,storage:rules` publishes the Security Rules that hardcode the two member emails.
3. Each member signs in once with the email-link flow and enters their own Anthropic API key in Settings.
4. `firebase deploy --only hosting` publishes the PWA, and each member installs it to their home screen.

Rollback: `firebase hosting:rollback` restores the previous release with one command. There is no backend deployment to roll back. Firestore document shapes change additively by convention, so no schema migration/rollback step is needed.

## Open Questions

These can be answered during implementation without changing the specs:
- The exact image long-edge size and segmenting threshold, to be picked from eval results.
- The quality-check thresholds, to be tuned on the sample set.
- The default monthly AI cap ($10 is proposed). The owners can change it in Settings.
- Whether to add a Cloud Function proxy later (trading a Firebase billing account for keeping the AI key off devices) once real usage and comfort with the on-device key are seen.
