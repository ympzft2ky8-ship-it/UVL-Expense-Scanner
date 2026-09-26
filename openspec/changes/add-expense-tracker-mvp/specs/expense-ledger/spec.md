# Spec Delta

## Purpose

Holds the current year's expense records: receipts, their line items and vendors. It computes each line's full cost including its share of tax, so property and category totals are complete.

## ADDED Requirements

### Requirement: One ledger per calendar year
The system SHALL keep one ledger for the current calendar year. It SHALL place each receipt in the ledger by its receipt date. It SHALL hold data for only one year at a time, except during the January grace period described in the year-end-archive capability.

#### Scenario: Receipt dated this year
- **WHEN** a member saves a receipt dated March 3 of the current year
- **THEN** it is added to the current year's ledger

#### Scenario: Receipt dated in a closed year
- **WHEN** a member tries to save a receipt dated in a year that has already been archived and cleared
- **THEN** the app refuses and explains that year is closed

### Requirement: Amounts stored exactly
The system SHALL store all money amounts exactly to the cent, in US dollars. Totals SHALL NOT be affected by rounding drift from adding many amounts.

#### Scenario: Many small amounts
- **WHEN** 1,000 lines of $0.10 each are totaled
- **THEN** the total is exactly $100.00

### Requirement: Tax allocation to lines
When a receipt shows tax as one amount, the system SHALL allocate it to the taxable lines in proportion to their amounts. It SHALL round each share to the cent. It SHALL give any leftover cent to the largest taxable line, so the shares add up exactly to the receipt's tax. Lines the receipt marks as not taxed SHALL get no tax. When the receipt does not say which lines are taxed, all lines SHALL be treated as taxed.

#### Scenario: Proportional allocation
- **WHEN** a receipt has taxable lines of $100.00 and $50.00 and tax of $13.31
- **THEN** the lines get $8.87 and $4.44 of tax, which add up to $13.31

#### Scenario: Non-taxed labor line
- **WHEN** a contractor invoice charges tax only on materials, $400 materials and $600 labor, with $35.50 tax
- **THEN** the materials line gets $35.50 tax and the labor line gets $0.00

### Requirement: Other charges allocation
Receipt-level delivery charges, fees and discounts SHALL each be recorded as their own line, typed Other, and assigned to the receipt's property. A discount that the receipt attaches to a specific item SHALL reduce that item's line.

#### Scenario: Receipt-level discount
- **WHEN** a receipt shows a $10.00 "Pro discount" that is not tied to any item
- **THEN** a -$10.00 line typed Other is added to the receipt

### Requirement: Full cost including tax
The system SHALL show each line's full cost (line amount plus its tax share) and each receipt's total. It SHALL show totals including and excluding tax by property, category, labor/materials type, vendor and month.

#### Scenario: Property summary
- **WHEN** a member opens "12 Oak St"
- **THEN** it shows the year-to-date total including tax, the tax portion, and totals by category and by labor/materials type

### Requirement: Credits and returns
The system SHALL record returns and refunds as negative amounts, including negative tax. Negative amounts SHALL reduce the property and category totals.

#### Scenario: Return of an item
- **WHEN** a return receipt refunds $45.00 plus $3.99 tax for an item bought for "12 Oak St"
- **THEN** 12 Oak St's totals decrease by $48.99

### Requirement: Vendor directory
The system SHALL keep a vendor directory built from saved receipts: name, address, phone, email and website. It SHALL match new receipts to an existing vendor when the name and address or phone match. It SHALL fill in missing contact details from newer receipts without overwriting details a member entered. Members SHALL be able to edit vendors and merge duplicates.

#### Scenario: Same store, slightly different name
- **WHEN** a receipt reads "THE HOME DEPOT #1234" and a saved vendor "Home Depot" has the same store phone number
- **THEN** the receipt is linked to the existing vendor

#### Scenario: Merge duplicates
- **WHEN** a member merges vendor "ABC Plumbing Inc" into "ABC Plumbing"
- **THEN** all receipts of both are linked to "ABC Plumbing" and the duplicate is removed

### Requirement: Payment tracking
The system SHALL record, for each receipt, the payment method read from it or chosen by the member: card with last 4 digits when shown, cash, check with number, bank transfer, or other.

#### Scenario: Card receipt
- **WHEN** a receipt shows "VISA ****4821"
- **THEN** the payment method is Card ending 4821
