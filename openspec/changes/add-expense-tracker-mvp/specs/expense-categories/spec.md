# Spec Delta

## Purpose

Sorts every expense into categories that match how the accountant prepares the LLC's partnership return. Rental repairs are kept apart from improvements, and flip costs are grouped per property.

## ADDED Requirements

### Requirement: Category lists by property type
The system SHALL offer category lists that depend on the property type of each line.
- **Rental properties:**
  - Repairs & Maintenance
  - Capital Improvement
  - Supplies
  - Cleaning & Maintenance Services
  - Utilities
  - Insurance
  - Property Taxes
  - Mortgage Interest
  - HOA / Condo Fees
  - Legal & Professional
  - Advertising
  - Travel & Auto
  - Other Rental Expense
- **Flip properties:**
  - Acquisition & Closing Costs
  - Renovation
  - Holding Costs – Utilities
  - Holding Costs – Insurance
  - Holding Costs – Property Taxes
  - Holding Costs – Interest
  - Selling Costs
  - Other Flip Cost
- **General / Overhead:**
  - Office & Supplies
  - Software & Subscriptions
  - Legal & Professional
  - Bank & Merchant Fees
  - Insurance
  - Travel & Auto
  - Meals
  - Education
  - Licenses & Fees
  - Other Business Expense

A line SHALL only accept a category from the list matching its property's type.

#### Scenario: Rental categories shown for a rental
- **WHEN** a member picks a category for a line assigned to a Rental property
- **THEN** only the Rental category list is offered

#### Scenario: Moving a line to a different property type
- **WHEN** a member moves a line from a Rental property to a Flip property
- **THEN** its category is cleared, and a category must be chosen from the Flip list

### Requirement: Tax treatment label
The system SHALL give every category a tax treatment label shown to members and included in exports:
- *Deduct this year*: Rental and Overhead categories, except Capital Improvement.
- *Capitalize & depreciate*: Capital Improvement.
- *Add to property cost*: all Flip categories except Selling Costs.
- *Reduces sale proceeds*: Selling Costs.

The app SHALL state in Settings and in the export that these labels are for organizing records and are not tax advice.

#### Scenario: Improvement label
- **WHEN** a line is categorized Capital Improvement
- **THEN** it shows the label "Capitalize & depreciate"

### Requirement: Category suggestions
The system SHALL suggest a category for every line from the line description, vendor, labor/materials type, property type and the member's past choices for the same vendor. The member SHALL be able to accept or change it.

#### Scenario: Learn from past choices
- **WHEN** members have categorized the last three lines from "ABC Plumbing" on rental properties as Repairs & Maintenance
- **THEN** a new ABC Plumbing line on a rental property is suggested as Repairs & Maintenance

### Requirement: Repair versus improvement needs a decision
For lines on Rental properties the system SHALL NOT silently default to Repairs & Maintenance or to Capital Improvement. When the description does not make the choice clear, it SHALL mark the category needs-check and show a short plain-language hint:
- *Repairs* keep the property in its normal working condition.
- *Improvements* make it better, restore it after major wear, or adapt it to a new use.

#### Scenario: Ambiguous rental line
- **WHEN** a rental line reads "Water heater 50 gal" with no other context
- **THEN** the category is marked needs-check with the repair-vs-improvement hint
- **AND** the member must pick one before the needs-check highlight clears

#### Scenario: Clear repair
- **WHEN** a rental line reads "Service call – unclog kitchen drain"
- **THEN** Repairs & Maintenance is suggested with confident status

### Requirement: Labor and materials kept distinct within categories
The system SHALL keep each line's Labor / Materials / Other type separate from its category, so that exports can show labor and materials totals within each category and property.

#### Scenario: Renovation totals split
- **WHEN** a flip property has Renovation lines of $5,000 Labor and $3,000 Materials
- **THEN** the property summary shows Renovation $8,000, split into Labor $5,000 and Materials $3,000
