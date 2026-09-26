# Spec Delta

## Purpose

Lets the members set up the properties (projects) that expenses are assigned to. The property type (Rental or Flip) decides which tax categories apply.

## ADDED Requirements

### Requirement: Create a property
The system SHALL let a member create a property with a required name and a required type (Rental or Flip). It SHALL also accept an optional street address, city, state, ZIP, and notes. For a Flip it SHALL accept an optional purchase date and sale date; for a Rental, an optional placed-in-service date.

#### Scenario: Create a rental property
- **WHEN** a member creates a property named "12 Oak St" with type Rental
- **THEN** "12 Oak St" appears in the property list marked Rental
- **AND** it can be selected when assigning expenses

#### Scenario: Name is required
- **WHEN** a member tries to save a property without a name
- **THEN** the property is not saved and the name field is highlighted

#### Scenario: Duplicate names are prevented
- **WHEN** a member creates a property whose name matches an existing active property, ignoring upper/lower case and extra spaces
- **THEN** the app refuses and points to the existing property

### Requirement: Built-in overhead project
The system SHALL always provide one project named "General / Overhead" for business costs not tied to a single property. It SHALL NOT allow this project to be deleted or archived.

#### Scenario: Overhead project exists from first use
- **WHEN** the members open the app for the first time
- **THEN** "General / Overhead" is already in the property list

### Requirement: Edit a property
The system SHALL let a member edit any field of a property at any time. The change SHALL apply to all expenses already assigned to it. When the type changes, the system SHALL flag the affected expense categories for review.

#### Scenario: Rename a property
- **WHEN** a member renames "12 Oak St" to "12 Oak Street"
- **THEN** every expense assigned to it shows the new name

#### Scenario: Changing type flags categories
- **WHEN** a member changes a property from Flip to Rental
- **AND** that property has expenses categorized with Flip categories
- **THEN** those expenses are flagged "category needs review" and listed for the member to re-categorize

### Requirement: Archive a property
The system SHALL let a member archive a property. An archived property SHALL be hidden from the pick list for new expenses but kept for existing expenses and exports. A property that has expenses SHALL NOT be deletable; one with no expenses SHALL be.

#### Scenario: Archive a sold flip
- **WHEN** a member archives "45 Elm Ave" after it is sold
- **THEN** it no longer appears when picking a property for a new expense
- **AND** its existing expenses still show it and still appear in exports

#### Scenario: Property with expenses cannot be deleted
- **WHEN** a member tries to delete a property that has expenses
- **THEN** the app refuses and offers to archive it instead

### Requirement: Default property for new scans
The system SHALL pre-select the most recently used active property when a new scan is reviewed, and SHALL let the member change it before saving.

#### Scenario: Several receipts for the same property
- **WHEN** a member saves a receipt to "12 Oak St" and then scans another receipt
- **THEN** "12 Oak St" is pre-selected on the new receipt's review screen

### Requirement: Properties carry over between years
The system SHALL keep active properties when a new year starts, so members do not re-create them.

#### Scenario: New year keeps properties
- **WHEN** the year-end archive is completed and the new year starts
- **THEN** all active properties are still listed, with no expenses
