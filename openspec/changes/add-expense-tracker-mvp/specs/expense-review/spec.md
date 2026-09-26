# Spec Delta

## Purpose

Makes checking and correcting expense data quick and obvious, both right after a scan and at any later time.

## ADDED Requirements

### Requirement: Review before saving
The system SHALL show every scanned receipt on a review screen before it is added to the ledger. A scan SHALL NOT enter the ledger until a member taps "Save".

#### Scenario: Review after scan
- **WHEN** a scan finishes reading
- **THEN** the review screen shows the image and all read fields, with the property pre-selected
- **AND** nothing is added to the ledger until the member taps "Save"

#### Scenario: Leave and come back
- **WHEN** a member leaves the review screen without saving
- **THEN** the scan stays in the "To review" list with its read values until saved or discarded

### Requirement: Highlight what needs checking
The review screen SHALL visually highlight every needs-check field. It SHALL show a count of fields left to check. It SHALL let the member jump to each one in turn and mark each as checked.

#### Scenario: Walk through flagged fields
- **WHEN** a receipt has 3 needs-check fields
- **THEN** the review screen shows "3 to check" and a "Next" button moves between them
- **AND** editing or confirming a field clears its highlight

### Requirement: Image beside the data
The review and edit screens SHALL let the member see the receipt image next to the fields: side-by-side on iPad, and on iPhone switchable with one tap. The image SHALL zoom.

#### Scenario: Check a value against the image on iPhone
- **WHEN** a member taps the image icon on the iPhone review screen
- **THEN** the zoomable image is shown and one tap returns to the same field

### Requirement: Save with unresolved warnings
The system SHALL let a member save a receipt that still has unresolved needs-check fields, only after an explicit confirmation. Such receipts SHALL stay marked and listed under a "Needs attention" filter. A receipt SHALL NOT be saved without a date, a total, a property, and a confirmed state.

#### Scenario: Save anyway
- **WHEN** a member taps "Save" with 1 unresolved field
- **THEN** the app asks "1 field still needs checking. Save anyway?"
- **AND** if confirmed, the receipt is saved and appears under "Needs attention"

#### Scenario: Missing required fields
- **WHEN** a member taps "Save" on a receipt with no date
- **THEN** the save is refused and the date field is highlighted

### Requirement: Edit saved entries
The system SHALL let a member change any field of a saved receipt or line item, add or remove line items, change a line's property, category or labor/materials type, and delete a receipt. Totals SHALL update immediately after each change.

#### Scenario: Fix a line amount
- **WHEN** a member changes a saved line amount from $18.99 to $19.89
- **THEN** the receipt's subtotal check and tax allocation update right away

#### Scenario: Delete a receipt
- **WHEN** a member deletes a receipt and confirms
- **THEN** it is removed from the ledger, and for 30 days it can be restored from "Recently deleted"

### Requirement: Split a receipt across properties
The system SHALL assign each line item to a property. By default all lines take the receipt's property. A member SHALL be able to assign individual lines to other properties. A member SHALL also be able to split a single line's amount between properties by amount or by percentage.

#### Scenario: One store trip for two properties
- **WHEN** a receipt has 4 lines and the member assigns 2 lines to "12 Oak St" and 2 to "45 Elm Ave"
- **THEN** each property's totals include only its own lines plus their share of tax

#### Scenario: Split one line 50/50
- **WHEN** a member splits a $200 line 50% / 50% between two properties
- **THEN** each property receives $100 of that line and its share of the tax

### Requirement: Manual entry
The system SHALL let a member create a receipt by hand, with the same fields and checks and no image. It SHALL let the member attach an image later.

#### Scenario: Cash payment without receipt
- **WHEN** a member enters a $300 labor payment by hand
- **THEN** it is saved like any other receipt and marked "no receipt image"

### Requirement: Find and filter
The system SHALL let a member search receipts by vendor, description, amount or invoice number. It SHALL let the member filter by property, category, labor/materials type, month, "Needs attention" and "No receipt image".

#### Scenario: Find a vendor's receipts
- **WHEN** a member searches "Home Depot" and filters to "12 Oak St"
- **THEN** only Home Depot receipts with lines on 12 Oak St are listed, with their total
