# Spec Delta

## Purpose

Closes out a tax year safely. It produces a complete archive of the year's records for long-term safekeeping and only then clears the year from the app.

## ADDED Requirements

### Requirement: Year-end archive package
The system SHALL let a member create a year-end archive for a completed year. The archive SHALL be a single .zip file named `UVL-Expenses-<year>-Archive.zip`. It SHALL contain:
- the full spreadsheet export;
- every receipt image or PDF, with file names that start with the date, vendor and receipt ID and match the Receipt ID column in the spreadsheet;
- a machine-readable copy of all the year's data (JSON), so it could be re-imported later.

#### Scenario: Create archive
- **WHEN** a member taps "Close year 2026" in January 2027
- **THEN** a zip with the spreadsheet, all 2026 receipt images and the data file is produced and the share sheet opens to save it

### Requirement: January grace period
The system SHALL keep the previous year open until it is closed, so that late receipts can still be added. From January 1 it SHALL accept receipts dated in the new year into a new ledger. It SHALL remind members to close the previous year once a week until they do.

#### Scenario: Late December receipt found in January
- **WHEN** a member scans a receipt dated December 28 on January 10, before closing the year
- **THEN** it is added to the previous year's ledger

#### Scenario: Reminder
- **WHEN** it is after January 1 and the previous year is not closed
- **THEN** the app shows a banner "2026 is still open – close it when your records are complete"

### Requirement: Clear only after confirmed save
The system SHALL NOT delete a year's data until:
- **(a)** the archive has been created;
- **(b)** the member confirms it was saved, by picking "I saved it" after the share sheet; and
- **(c)** the member types the year to confirm deletion.

After clearing, all receipts, line items and images of that year SHALL be removed from the backend and all devices. Properties, vendors and category learning SHALL be kept.

#### Scenario: Member cancels the share sheet
- **WHEN** a member creates the archive but dismisses the share sheet without saving
- **THEN** the year is not cleared and remains in the app

#### Scenario: Confirmed clear
- **WHEN** the member confirms they saved the archive and types "2026"
- **THEN** all 2026 receipts and images are removed from the app and backend
- **AND** properties and vendors are still available for 2027

### Requirement: Retention reminder
The archive screen SHALL tell members in plain language that the IRS generally expects business records to be kept for at least 3 years, and longer in some cases (commonly up to 7 years). It SHALL recommend saving the archive in two places, for example iCloud Drive and a computer.

#### Scenario: Retention message shown
- **WHEN** a member opens the "Close year" screen
- **THEN** the retention reminder is displayed before the archive is created

### Requirement: Undo window after clearing
The system SHALL keep a hidden backup of a cleared year for 30 days after clearing, so it can be restored if the saved archive turns out to be lost or damaged. After 30 days the backup SHALL be permanently deleted.

#### Scenario: Restore within 30 days
- **WHEN** a member chooses "Restore 2026" in Settings 10 days after clearing it
- **THEN** all 2026 data and images return to the app
