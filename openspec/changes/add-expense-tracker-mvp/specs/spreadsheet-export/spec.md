# Spec Delta

## Purpose

Produces the year's expenses as a spreadsheet file that opens correctly in Microsoft Excel, Apple Numbers and Google Sheets, laid out for the accountant.

## ADDED Requirements

### Requirement: Export on demand
The system SHALL let a member export the current year's ledger at any time as a single .xlsx file named `UVL-Expenses-<year>-<YYYY-MM-DD>.xlsx`. The file SHALL be shareable from the phone through the standard iOS share sheet (Save to Files, Mail, AirDrop, Google Drive app).

#### Scenario: Export mid-year
- **WHEN** a member taps "Export spreadsheet" on September 26, 2026
- **THEN** a file named `UVL-Expenses-2026-2026-09-26.xlsx` is produced and the iOS share sheet opens

### Requirement: Workbook contents
The workbook SHALL contain these sheets:
1. **Expenses**: one row per line item (or per property share of a split line). Columns:
   - Date, Vendor, Vendor Address, Vendor Phone, Vendor Email, Invoice #
   - Property, Property Type
   - Category, Tax Treatment, Labor/Materials
   - Description, Quantity, Unit Price, Amount, Tax, Total incl. Tax
   - Tax State, Tax Rate
   - Payment Method, Receipt ID, Needs Attention, Notes
2. **By Property**: for each property, totals by category, split into Labor, Materials and Other, with tax and totals including tax.
3. **By Category**: totals by tax treatment and category across all properties.
4. **By Vendor**: total paid per vendor, with contact details.
5. **By Month**: totals per month by property.
6. **About**: the tax year, export date, the not-tax-advice note, and the count of entries still marked "Needs attention".

#### Scenario: Accountant opens the workbook
- **WHEN** the accountant opens the exported file
- **THEN** all six sheets are present with headers on row 1 and the Expenses sheet sorted by date

### Requirement: Totals that match the app
Every total in the summary sheets SHALL equal the corresponding total shown in the app to the cent. The summary sheets SHALL use formulas that reference the Expenses sheet, so that the totals update if the accountant edits a row.

#### Scenario: Totals agree
- **WHEN** the app shows 12 Oak St at $18,452.17 including tax
- **THEN** the By Property sheet shows $18,452.17 for 12 Oak St

#### Scenario: Accountant edits a row
- **WHEN** the accountant changes an Amount on the Expenses sheet in Excel
- **THEN** the related totals on the summary sheets update

### Requirement: Opens correctly in Excel, Numbers and Google Sheets
The workbook SHALL open without errors or repair prompts in current Microsoft Excel, Apple Numbers (iPhone, iPad and Mac) and Google Sheets. It SHALL use only features all three support. Dates SHALL be real dates and amounts SHALL be numbers formatted as US dollars, not text.

#### Scenario: Open in Numbers on iPhone
- **WHEN** a member opens the exported file in Numbers on an iPhone
- **THEN** all sheets, dates, dollar amounts and totals display correctly

#### Scenario: Import to Google Sheets
- **WHEN** the file is uploaded to Google Drive and opened with Google Sheets
- **THEN** the formulas compute the same totals as in Excel

### Requirement: Export includes flagged entries visibly
The export SHALL include receipts still marked "Needs attention" and SHALL mark those rows. Before exporting, the app SHALL tell the member how many are unresolved.

#### Scenario: Unresolved entries at export
- **WHEN** 2 receipts still need attention at export time
- **THEN** the app says "2 receipts still need attention" with options to review them first or export anyway
- **AND** those rows are marked in the Needs Attention column
