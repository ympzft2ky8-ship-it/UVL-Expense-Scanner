# Design

## Context

The repository is empty (greenfield). See proposal.md for the motivation and specs/ for the required behavior. Constraints that shape the design:

- Two users, about 20 receipts a month, iPhone and iPad Safari. No Mac and no paid Apple developer account, so the app is a Progressive Web App.
- Hosting must fit free tiers. AI reading costs about $1–2/month, with a hard cap.
- Accuracy of reading is the top priority. Everything else is secondary to "don't frustrate the user with wrong data".
- Users are not technical: there are no servers to administer and no manual database work.

## Goals / Non-Goals

**Goals:**
- One TypeScript codebase for the app, the API and the shared rules (money math, consistency checks, categories). The phone and the backend then always agree on calculations.
- An offline-first client with a simple, predictable sync model sized for two users.
- An extraction pipeline whose accuracy is measured by a repeatable eval, not by impression.

**Non-Goals:**
- Native iOS app, App Store distribution, Face ID lock.
- Real-time collaborative editing (live cursors, instant push). Polling is enough for two users.
- Multi-currency, multi-company, more than two users, mileage tracking, income tracking, 1099 reporting. Each of these can be a later change.
- Direct Google Drive or Google Sheets API integration. The iOS share sheet covers saving to Drive.

## Decisions

### D1. Progressive Web App with React + Vite + TypeScript
- **Choice:** React + Vite + TypeScript, with `vite-plugin-pwa` (Workbox) for the manifest, offline shell and asset caching.
- **Why:** it installs to the home screen, works offline, runs on iPhone, iPad and Android, and needs no Mac.
- **Alternatives:**
  - Native SwiftUI: rejected by the owners over cost and the Mac requirement.
  - Capacitor/React Native: rejected because they still need Xcode to ship to iOS.
  - SvelteKit/Vue: viable, but React has the widest library support for the pieces we need (camera handling, spreadsheet writing).

### D2. Cloudflare Pages + Workers + D1 + R2 as the backend
- **Choice:**
  - Pages serves the static app.
  - A single Worker serves `/api/*`.
  - D1 (SQLite) holds the data.
  - R2 holds images and PDFs.
- **Why:** all four have free tiers far above our volume (D1 5 GB, R2 10 GB, and roughly 150 MB of images a year). Free projects are not paused for inactivity, and there is nothing to administer. The Worker is also where the Anthropic key lives, so the key never reaches a phone.
- **Alternatives:**
  - Supabase: good, but free projects pause after a week of inactivity, which is likely at 20 receipts a month.
  - Firebase: viable, but Firestore's document model makes ledger totals and exports clumsier than SQL, and it has more lock-in.
  - iCloud/CloudKit JS: needs the $99/yr Apple developer account.

### D3. Sign-in with Cloudflare Access (one-time PIN)
- **Choice:**
  - Cloudflare Access (Zero Trust free plan, up to 50 users) protects both the app and `/api/*`. Its policy allows exactly the two member email addresses.
  - Login uses the one-time PIN emailed by Access, with a 30-day session.
  - The Worker verifies the `Cf-Access-Jwt-Assertion` header (signature, audience, issuer) on every request, reads the member's email from it, and uses that email for `created_by` and `updated_by`.
- **Why:** no password storage, no email-sending service and no auth code to maintain. Non-members never reach the app.
- **Alternatives:**
  - A custom magic-link or OTP flow: needs an email provider and more code.
  - Passkeys (WebAuthn): nicer UX, but more code. They can be added later without changing the specs.

### D4. Sync: server-authoritative, versioned rows, outbox and polling
- **Server side:**
  - Every syncable row (property, vendor, receipt, line, line_split) has `id` (UUID, generated on the client), `version` (integer), `updated_at`, `updated_by`, and a `deleted_at` tombstone.
  - A D1 table `changes(seq INTEGER PRIMARY KEY AUTOINCREMENT, entity, id)` records every write, giving a monotonic cursor.
- **Pull:** `GET /api/sync?since=<seq>` returns rows changed since the cursor. The client pulls when the app opens, when it regains focus, on pull-to-refresh, and every 30 s while visible. That meets the spec's "within 1 minute" requirement.
- **Push:**
  - Local edits go to a Dexie (IndexedDB) mirror and an **outbox** of mutations. Each mutation carries the `base_version` it was edited from.
  - The Worker applies a mutation only if `base_version == current version`. Otherwise it returns `409` with the current row.
  - On a 409, the client runs a three-way merge per field (base / mine / theirs):
    - fields changed by only one side merge automatically;
    - fields changed by both are shown to the member to pick from. This is the conflict protection in access-and-sync.
- **Why:** two users who rarely edit at the same moment don't need CRDTs or websockets. Per-row versions make conflicts detectable and explainable. Client-generated UUIDs let offline-created receipts sync without renumbering.
- **Alternatives:**
  - Last-write-wins: rejected, because it loses edits silently.
  - Durable Objects with websockets: unnecessary complexity for this scale.
  - CRDT libraries (Yjs/Automerge): overkill for form-like records.

### D5. Capture pipeline on the device
- **Camera:** `<input type="file" accept="image/*,application/pdf" capture="environment">` opens the native iOS camera at full resolution. `getUserMedia` gives a live preview but only video-frame resolution, which is worse for small receipt text. The same input without `capture` covers importing from Photos and Files.
- **Straightening:**
  - OpenCV.js runs edge and contour detection followed by a perspective warp. It is lazy-loaded only on the capture screen and cached by the service worker, so the roughly 8 MB download happens once.
  - Manual four-corner adjustment is always available and is the fallback.
- **Quality checks:** variance of the Laplacian for blur, a highlight-clipping ratio for glare, mean luminance for darkness, and estimated text height relative to image size for "too far away". Thresholds are tuned against the sample set.
- **Output:** a straightened JPEG (quality about 0.85) is stored. The long edge is capped at a size the eval shows is sufficient. Very tall receipts, with an aspect ratio above about 3:1, are sent to the model as overlapping segments so text isn't shrunk below legibility.
- **PDFs:** stored and sent to the model as PDF documents. pdf.js is used only to render thumbnails.
- **Offline queue:** captured files are stored in IndexedDB until they are uploaded to R2 via the Worker.

### D6. Extraction: Claude with structured output, deterministic checks, and one targeted re-read
- **Request:** the Worker calls the Anthropic Messages API with the official TypeScript SDK (`@anthropic-ai/sdk`):
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
- **Deterministic checks:** the consistency checks from the spec (a–e) live in `packages/shared` and run in both the Worker and the client. The model's self-reported confidence is only one input. Arithmetic failures always override it.
- **Targeted re-read:** if any arithmetic check fails, the Worker makes one follow-up request. It includes the same image and the specific discrepancy (for example, "lines sum to $142.10 but you read subtotal $124.10; re-read the subtotal and each line amount"). The second result is kept only if it resolves the discrepancy. Otherwise the fields stay needs-check. This costs extra only on the minority of receipts that fail checks, and it fixes the most common failure (a single misread digit).
- **Cost metering:** each response's `usage` is priced with a price table in config and added to a monthly total in D1. The cap is checked before each call.
- **Why:** accuracy comes first, so the most capable model plus arithmetic verification is worth about $0.05–0.10 per receipt at 20 receipts a month. The eval (D10) decides whether a cheaper model (for example `claude-sonnet-5`) is equally accurate. Switching is then a one-line config change, and the owners make that call.
- **Alternatives:**
  - On-device OCR (Tesseract.js) with rules: much worse on line items, faded thermal paper and handwriting.
  - Dedicated receipt OCR APIs (e.g. Veryfi, Mindee): per-document pricing at our volume is similar or higher, and they can't do our labor/materials and repair-vs-improvement classification.

### D7. Money and tax math
- All amounts are integer cents in the database and in the code. Tax rates are stored as basis points ×100 (e.g. 8.875% → 88750).
- Tax allocation follows the expense-ledger spec: proportional shares rounded to the cent, with any remainder given to the largest taxable line. It is implemented once in `packages/shared` and unit-tested with the spec scenarios.
- A split line stores its share as either an amount or a percentage. The line's tax share is split in the same ratio, with the same remainder rule.

### D8. Data model (D1)
- **`property`**: `id, name, type (rental|flip|overhead), address fields, purchase_date, sale_date, in_service_date, archived_at`
- **`vendor`**: `id, name, normalized_name, address fields, phone, email, website, merged_into`
- **`receipt`**:
  - `id, ledger_year, date, vendor_id, invoice_no`
  - `subtotal_cents, tax_cents, total_cents, tax_state, tax_rate_bp`
  - `payment_method, payment_ref, property_id (default for lines)`
  - `status (queued|reading|to_review|saved)`, `needs_attention`, `field_flags (JSON)`, `extraction_raw (JSON)`, `notes`
- **`line`**: `id, receipt_id, position, description, sku, qty, unit_price_cents, amount_cents, taxed, tax_cents, kind, category, category_flag`
- **`line_split`**: `id, line_id, property_id, amount_cents | percent_bp`. Absent means the whole line goes to the receipt's property.
- **`attachment`**: `id, receipt_id, r2_key, mime, page, bytes`
- **`category_memory`**: `vendor_id, property_type, category, count`. Used for suggestions.
- **`usage_month`**: `month, cost_microdollars, cap_microdollars`
- **`year`**: `year, status (open|closed), archived_at, backup_until`
- All syncable tables also have the D4 sync columns.

### D9. Spreadsheet export generated on the device with ExcelJS
- **Choice:** ExcelJS runs in the browser, so export works offline.
- **Why:**
  - SheetJS Community Edition cannot write cell styles.
  - A server-side export would hit the Workers free-tier CPU limit.
- **Compatibility rules for Excel, Numbers and Google Sheets:**
  - Use only `SUM` and `SUMIFS` formulas.
  - No pivot tables, Excel tables, dynamic arrays, macros or conditional-format rules beyond basic fills.
  - Dates are real date cells and currency uses the `"$"#,##0.00` format.
  - Every formula also carries its **cached result**, because iOS Quick Look and some importers display cached values without recalculating.
- **Verification:** exported files are checked in CI by re-opening them with a second library and comparing each summary total to the ledger. They are opened manually in Numbers and Google Sheets before release.

### D10. Accuracy eval harness
- **Files:** `evals/extraction/` holds a Node script that runs the exact production prompt and schema module over `samples/receipts/test/*`. Each sample has a `<id>.expected.json` answer key.
- **Scoring:**
  - money exact to the cent; dates exact;
  - vendor name matched case-insensitively and ignoring punctuation and store numbers;
  - lines matched by amount plus description similarity.
- **Report:** per-field accuracy, a list of wrong values, and a list of **wrong-and-not-flagged** values (the metric that matters most, since those reach the ledger unnoticed). It is written as a markdown report so two versions can be compared side by side.
- **Cost:** a full run of 30 receipts costs about $2–3, so runs are deliberate: before a release, or when the prompt, model or image pipeline changes. They are not run on every commit.
- **Split:** samples are divided into `examples/` (used in the prompt, never scored) and `test/` (scored, never shown to the model). This keeps the scores honest.

### D11. Repository layout
```
apps/web          PWA (React)
apps/api          Cloudflare Worker (API, extraction, sync)
packages/shared   money math, tax allocation, checks, categories, schema types
evals/extraction  accuracy eval harness
samples/receipts  private sample receipts and answer keys
openspec/         specs and changes
.claude/skills/   project skills for Claude Code
```
The project uses npm workspaces, Vitest for unit tests, Playwright for end-to-end tests with WebKit (the engine closest to iOS Safari), and Wrangler for local dev and deploys.

## Risks / Trade-offs

- **[Workers free plan allows about 10 ms CPU per request]** Base64-encoding a large image or building a zip in the Worker could exceed it.
  → Mitigation: send images to Claude by short-lived signed R2 URL instead of base64, so the Worker only forwards JSON. Build exports and archives on the device. If limits are still hit, Workers Paid is $5/month; ask the owners before upgrading.
- **[Cloudflare Access login inside a home-screen PWA]** iOS gives home-screen apps separate cookie storage from Safari, so members sign in once inside the installed app, and sessions expire after 30 days.
  → Mitigation: test on real devices in the first milestone. If it's awkward, switch to passkeys in the Worker (D3 alternative) without changing the specs.
- **[File-input camera has no live framing guide]**
  → Mitigation: automatic crop, quality checks with retake, manual corner adjustment, and the Notes "Scan Documents" PDF import as a high-quality fallback.
- **[iOS may evict website storage]** Home-screen PWAs are exempt from Safari's 7-day eviction, and the server is the source of truth, so only unsynced outbox items are at risk.
  → Mitigation: show an "unsent changes" indicator and sync immediately when online.
- **[AI misreads that pass all checks]** For example, a wrong date or a wrong vendor phone.
  → Mitigation: mandatory review screen, eval tracking of wrong-and-not-flagged fields, and the release gate in receipt-extraction.
- **[Large archive in phone memory]** About 150 MB of images a year when zipped on an iPhone.
  → Mitigation: store images uncompressed in the zip (JPEG is already compressed) and use a streaming zip writer. If the archive exceeds about 300 MB, split it into numbered parts.
- **[AI price or model changes]**
  → Mitigation: the price table and model ID live in config, the monthly cap limits exposure, and the eval re-validates any model change.
- **[Tax categorization is not tax advice]**
  → Mitigation: labels are phrased as organizing aids, with a disclaimer in the app and the export. The accountant reviews the export.

## Migration Plan

Greenfield, so there is no data migration. Deployment order:
1. The owners create a Cloudflare account and an Anthropic API account with prepaid credits and a spend limit.
2. `wrangler` creates the D1 database and R2 bucket, applies the schema migrations, and sets the `ANTHROPIC_API_KEY` secret.
3. Cloudflare Access is configured with the two member emails and a 30-day session.
4. The Pages project is deployed, and each member installs the app to the home screen.

Rollback: Pages and Workers keep previous deployments, which can be re-activated with one command. D1 schema migrations are additive only in this release.

## Open Questions

These can be answered during implementation without changing the specs:
- The exact image long-edge size and segmenting threshold, to be picked from eval results.
- The quality-check thresholds, to be tuned on the sample set.
- The default monthly AI cap ($10 is proposed). The owners can change it in Settings.
