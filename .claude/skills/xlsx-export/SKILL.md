---
name: xlsx-export
description: Layout and compatibility rules for UVL Expense Scanner's .xlsx export (Expenses, By Property, By Category, By Vendor, By Month, About sheets) so it opens correctly in Excel, Apple Numbers and Google Sheets. Use when building or changing the spreadsheet export, the year-end archive's spreadsheet, or the export tests.
---

# Spreadsheet export

The contract is the spreadsheet-export spec. The design is D9: ExcelJS generates the file in the browser, so export works offline. Code: `apps/web/src/export/workbook.ts`. Tests: `apps/web/src/export/workbook.test.ts`.

## Compatibility rules (Excel + Numbers + Google Sheets)

- Formulas: only `SUM` and `SUMIFS`, with plain A1 references to the Expenses sheet (`Expenses!$O:$O`). Do not use:
  - Excel Tables (ListObjects), structured references or named ranges;
  - pivot tables, dynamic arrays (`FILTER`, `UNIQUE`, `LET`), `XLOOKUP`;
  - macros, external links, data validation lists, or conditional formatting beyond simple fills.
- **Every formula cell must also carry its cached result** (`{ formula, result }` in ExcelJS). iOS Quick Look and some importers show cached values without recalculating.
- Dates are real date cells with format `yyyy-mm-dd`. Money is a number with format `"$"#,##0.00`. Rates are numbers with format `0.000%`. Never write numbers as text.
- Row 1 holds the headers, bold, with a frozen header row. Set column widths explicitly, because Numbers ignores auto-fit.
- Sheet names have no special characters and are at most 31 chars.
- File name: `UVL-Expenses-<ledgerYear>-<YYYY-MM-DD>.xlsx`.

## Sheets

1. **Expenses**: one row per line item, or per property share of a split line. Sorted by Date, then Receipt ID, then line position. Column order (keep stable; the accountant may build on it):
   `Date | Vendor | Vendor Address | Vendor Phone | Vendor Email | Invoice # | Property | Property Type | Category | Tax Treatment | Labor/Materials | Description | Quantity | Unit Price | Amount | Tax | Total incl. Tax | Tax State | Tax Rate | Payment Method | Receipt ID | Needs Attention | Notes`
2. **By Property**: one block per property: rows are categories, and the columns are Labor, Materials, Other, Tax and Total incl. Tax. Add a subtotal per property and a grand total.
3. **By Category**: grouped by Tax Treatment, then Category. Columns: Amount, Tax, Total incl. Tax.
4. **By Vendor**: Vendor, Phone, Email, Address, receipt count, Total incl. Tax. Sorted by total, descending.
5. **By Month**: rows are months Jan–Dec, columns are properties, plus a total column.
6. **About**: tax year; export timestamp; number of receipts and lines; number still marked Needs Attention; the disclaimer "Categories and tax treatment labels organize records for your accountant and are not tax advice."

## Correctness requirements

- Every summary total must equal the in-app total **to the cent**. Compute the cached results with the same `packages/shared` money functions the app uses; never recompute with floats.
- The export test builds a fixture ledger (including a return, a split line, an untaxed labor line and a flagged receipt). It then:
  - writes the workbook;
  - re-reads it with a second parser;
  - asserts the header list matches the column order above exactly;
  - asserts every cached summary value equals the ledger totals.
- Before a release, open one real export in Excel, in Numbers on iPhone, and in Google Sheets (uploaded to Drive). Record the results in `docs/device-checks.md`.

## Sharing

After generating the file, use `navigator.share({ files: [file] })` when `navigator.canShare` supports it (iOS share sheet: Save to Files, Mail, AirDrop, Drive). Otherwise trigger a download.
