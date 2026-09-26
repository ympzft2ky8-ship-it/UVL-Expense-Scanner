# Proposal: UVL Expense Scanner (first release)

## Why

Urban Vibes Living LLC tracks property expenses by hand. At tax time that means sorting paper receipts by property, re-typing vendors and amounts, and working out which costs were repairs and which were improvements. The owners want to scan each receipt or invoice when they get it and have one clean, correct spreadsheet per year ready for the accountant. The top priority is accurate reading of receipts, because fixing wrong data is what makes these tools frustrating.

## What Changes

This is a new app, so everything below is new.

- **Installable phone app (web app).** Opens from the iPhone/iPad home screen like a normal app. No App Store, no Mac, no Apple developer fee. Only the two LLC members can sign in.
- **Properties as projects.** Each project is a property, marked as a *Rental* or a *Flip*, plus one built-in *General / Overhead* project for costs not tied to a property.
- **Scan a receipt or invoice.** Take a photo in the app, or import a photo or PDF (for example a PDF made with the iPhone Notes "Scan Documents" feature, or an invoice emailed as a PDF). The app straightens the image and asks for a retake if it is blurry.
- **Automatic reading.** An AI model reads the vendor, the vendor's contact details, the date, each line item and its price, whether each line is labor or materials, the sales tax and the total. It also reads the state from the vendor's address, and asks if it can't find one (New York is suggested).
- **Always reviewed before saving.** Every scan opens a review screen. Fields the AI is unsure about are highlighted, and so is anything that doesn't add up (for example, lines plus tax not matching the printed total).
- **Tax-friendly categories.**
  - *Rental* costs are sorted into *repair/maintenance*, which can usually be deducted this year, or *capital improvement*, which is usually depreciated over several years.
  - *Flip* costs are marked as added to the property's cost.
  - The app suggests a category; you confirm it. Your accountant makes the final call. The app organizes records and does not give tax advice.
- **Full cost including tax.** When a receipt shows tax only as a single total, the app spreads it across the taxable lines. That way every line and every property shows its full cost.
- **Easy editing.** Any saved field can be changed later, lines can be moved to a different property, and entries can be deleted.
- **Both phones stay in sync.** Data is stored in a small private cloud backend, so both phones see the same records. You can review and edit offline. Scans made offline are read once you are back online. If both of you change the same entry, the app warns you instead of silently overwriting.
- **Export.** One tap creates an Excel file (.xlsx) that opens in Excel, Apple Numbers and Google Sheets. It has a full list of expenses and summaries by property, category, vendor and month.
- **One year at a time.** The app holds the current calendar year. At year-end it creates an archive (the spreadsheet plus a zip of all receipt images) to save in iCloud Drive or Files. The IRS expects these records to be kept for years. After the archive is saved, the app clears the year.
- **Cost guard.** AI reading costs a few cents per scan (about $1–2 a month at 20 receipts). A monthly spending cap stops scans from ever running up an unexpected bill.

## Capabilities

### New Capabilities

- `access-and-sync`: sign-in limited to the two members; sync between phones and tablets; offline use; conflict warnings.
- `properties`: create, edit and archive projects (properties) of type Rental or Flip, plus the built-in General / Overhead project.
- `receipt-capture`: camera capture, photo/PDF import, image straightening, quality checks, offline scan queue.
- `receipt-extraction`: AI reading of receipt and invoice data, confidence flags, math and date consistency checks, state detection, labor/materials classification, monthly AI spending cap.
- `expense-review`: the review screen after each scan, and editing, splitting, moving and deleting saved entries.
- `expense-categories`: category list and tax treatment rules for rentals, flips and overhead, with suggestions the user confirms.
- `expense-ledger`: the yearly record of receipts, line items and vendors, including tax allocation and full-cost totals.
- `spreadsheet-export`: the .xlsx workbook layout and its compatibility with Excel, Numbers and Google Sheets.
- `year-end-archive`: building the year-end archive, confirming it was saved, and clearing the year.

### Modified Capabilities

None. This is the first release.

## Impact

- **New code:** a web app (the part on the phone) and a small cloud API (the part that stores data and talks to the AI).
- **New accounts needed:**
  - a free Cloudflare account, for hosting, database, receipt image storage and sign-in;
  - an Anthropic API account with prepaid credits, for receipt reading.
- **Ongoing cost:** $0 hosting on free tiers, plus about $1–2/month of AI usage, capped.
- **Privacy:** receipts and images are stored in the owners' own Cloudflare account. Receipt images are sent to the Anthropic API only to be read.
- **Accuracy test set:** 20–30 real receipts, each with a checked answer key, are kept in the repository (which must stay private) and used to measure reading accuracy before each release.
