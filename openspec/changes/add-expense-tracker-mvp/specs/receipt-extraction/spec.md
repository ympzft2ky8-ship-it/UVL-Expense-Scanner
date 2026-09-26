# Spec Delta

## Purpose

Automatically reads the details of a receipt or invoice with high accuracy. It flags anything uncertain or inconsistent so the member can check it before it is saved.

## ADDED Requirements

### Requirement: Fields read from each receipt
For each receipt or invoice the system SHALL attempt to read these header fields:
- vendor name
- vendor street address, city, state and ZIP
- vendor phone, email and website
- receipt or invoice number
- receipt or invoice date
- subtotal, total sales tax, and each separate tax line with its printed rate when shown
- other charges: delivery, fees, discounts, deposits
- total
- payment method, when shown

For each line item the system SHALL attempt to read:
- description
- item or SKU number, when shown
- quantity, unit price and line amount
- whether the line is taxed, when the receipt marks it

#### Scenario: Typical hardware store receipt
- **WHEN** a clear receipt from a hardware store with 5 items, NY sales tax and a total is read
- **THEN** the vendor, address, date, all 5 lines with quantities and amounts, subtotal, tax and total are filled in on the review screen

#### Scenario: Field not on the receipt
- **WHEN** a receipt does not show a vendor email address
- **THEN** the email field is left empty and is not invented

### Requirement: No invented values
The system SHALL leave a field empty when it is not printed or written on the document. It SHALL NOT guess values that are not present. The one exception is values computed by the rules in this spec, and those SHALL be marked as computed.

#### Scenario: Missing tax rate
- **WHEN** a receipt shows a tax amount but no tax rate
- **THEN** the rate is computed from the tax amount and taxable subtotal and labeled "calculated"

### Requirement: Labor or materials classification
The system SHALL classify every line item as Labor, Materials, or Other (for fees, delivery, permits, rentals of equipment and similar). The member SHALL be able to change the classification.

#### Scenario: Contractor invoice mixing labor and materials
- **WHEN** an invoice lists "Install vanity – 6 hrs" and "Vanity 36in"
- **THEN** the first line is classified Labor and the second Materials

#### Scenario: Delivery fee
- **WHEN** a receipt includes a "Delivery" charge
- **THEN** that line is classified Other

### Requirement: State detection
The system SHALL determine the state where tax was charged from the vendor or store address on the document. When no state can be determined, it SHALL leave the state empty, pre-fill New York as a suggestion, and require the member to confirm it before saving.

#### Scenario: State printed in address
- **WHEN** the store address reads "Yonkers, NY 10701"
- **THEN** the state is set to NY

#### Scenario: No address on receipt
- **WHEN** a handwritten invoice has no address
- **THEN** the state field is highlighted with NY suggested and must be confirmed before saving

### Requirement: Confidence flags
The system SHALL mark each read field as confident or needs-check, and SHALL mark needs-check whenever:
- the value was hard to read (faded, handwritten, folded or cut off);
- the value was inferred rather than printed; or
- a consistency check below fails.

#### Scenario: Faded total
- **WHEN** the total on a thermal receipt is faded and partly unreadable
- **THEN** the total is marked needs-check and highlighted on the review screen

### Requirement: Consistency checks
After reading, the system SHALL check the following, and SHALL mark every involved field needs-check when a check fails:
- **(a)** each line's quantity × unit price equals its line amount, within $0.01;
- **(b)** the sum of line amounts, minus discounts, equals the subtotal, within $0.01;
- **(c)** subtotal + tax + other charges equals the total, within $0.01;
- **(d)** the date is not in the future and falls within a ledger year that is still open (the current year, or the previous year until it is closed);
- **(e)** the effective tax rate is between 0% and 10%.

#### Scenario: Lines do not add up
- **WHEN** the line amounts read sum to $142.10 but the subtotal read is $124.10
- **THEN** the subtotal and all line amounts are marked needs-check
- **AND** the review screen shows "Line items add up to $142.10 but the subtotal says $124.10"

#### Scenario: Receipt from last year
- **WHEN** a receipt dated in the previous year is scanned in March
- **THEN** the date is marked needs-check with the message "This receipt is from last year"

### Requirement: Accuracy target
Before each release, the system's reading SHALL be measured against the private accuracy test set of real receipts, each with a checked answer key. A release SHALL NOT proceed unless:
- **(a)** the total, date and vendor name are correct on at least 97% of test receipts;
- **(b)** at least 95% of all line amounts are correct;
- **(c)** every incorrect total, date or line amount is marked needs-check (0 unflagged errors on these fields).

#### Scenario: Accuracy report before release
- **WHEN** a change to the reading instructions or AI model is proposed
- **THEN** the accuracy test is run and its report shows the scores above for the new version and the current version side by side

### Requirement: Reading status and failure handling
The system SHALL show progress while a receipt is being read, SHALL normally finish within 30 seconds, and SHALL let the member enter the receipt by hand if reading fails.

#### Scenario: Reading fails
- **WHEN** the AI service is unavailable or returns an error after automatic retries
- **THEN** the member sees "Couldn't read this receipt" with options "Try again" and "Enter by hand"
- **AND** the captured image is kept either way

#### Scenario: Not a receipt
- **WHEN** the image is not a receipt or invoice
- **THEN** the member is told the image does not look like a receipt and is offered a retake

### Requirement: Monthly AI spending cap
The system SHALL track the AI reading cost for each calendar month. Once the configured monthly cap is reached (default $10), it SHALL stop automatic reading, and it SHALL still allow manual entry. At 80% of the cap it SHALL warn the members.

#### Scenario: Cap reached
- **WHEN** the month's reading cost reaches the cap
- **THEN** new scans are saved with their images and marked "waiting to read – monthly limit reached"
- **AND** members can enter them by hand or raise the cap in Settings

#### Scenario: Cost visible
- **WHEN** a member opens Settings
- **THEN** the reading cost so far this month and the cap are shown
