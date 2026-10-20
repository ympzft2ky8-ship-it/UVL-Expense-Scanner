# Spec Delta

## Purpose

Restricts the app to the two LLC members and keeps their phones and tablets showing the same data, including when a device is temporarily offline.

## ADDED Requirements

### Requirement: Installable app
The app SHALL be installable to the iPhone and iPad home screen from Safari and SHALL open full-screen without browser controls when launched from the home screen.

#### Scenario: Add to home screen
- **WHEN** a member opens the app in Safari and chooses "Add to Home Screen"
- **THEN** an app icon named "UVL Expenses" appears on the home screen
- **AND** launching it opens the app full-screen

#### Scenario: First-run install hint
- **WHEN** the app is opened in a Safari tab rather than from the home screen
- **THEN** the app shows a short, dismissible hint explaining how to add it to the home screen

### Requirement: Members-only access
The system SHALL allow access only to email addresses on the members list (the two LLC members), using a sign-in link sent by email, and SHALL deny all data access to anyone else, including at the data layer so a modified or compromised client cannot bypass the restriction.

#### Scenario: Member signs in
- **WHEN** a member enters their email address and taps the sign-in link sent to it, on the same device
- **THEN** the member is signed in and sees the current year's data

#### Scenario: Non-member is refused
- **WHEN** someone enters an email address that is not on the members list
- **THEN** no code is sent and no data is shown

#### Scenario: Session lasts long enough for daily use
- **WHEN** a member has signed in on a device
- **THEN** the member stays signed in on that device for at least 30 days unless they sign out

### Requirement: Attribution of changes
The system SHALL record which member created and which member last changed every receipt, line item, property and vendor, and when.

#### Scenario: Edit history visible
- **WHEN** a member opens a saved receipt
- **THEN** the screen shows who added it and who last changed it, with dates

### Requirement: Sync between devices
The system SHALL store all data in a shared store reachable from both members' devices and SHALL show changes made on one member's device on the other member's devices within 1 minute of the other device being open and online.

#### Scenario: New receipt appears on the other phone
- **WHEN** member A saves a receipt while online
- **AND** member B opens the app on their phone while online
- **THEN** member B sees the new receipt within 1 minute

#### Scenario: Pull to refresh
- **WHEN** a member pulls down on the receipts list
- **THEN** the app fetches the latest changes immediately

### Requirement: Offline use
The system SHALL let a member view, edit and create entries while offline and SHALL send those changes to the backend automatically when the device is back online.

#### Scenario: Edit while offline
- **WHEN** a member edits a receipt's date while the phone has no connection
- **THEN** the change is saved on the phone and marked "waiting to sync"
- **AND** it is sent to the backend automatically once the phone is online

#### Scenario: Offline status is visible
- **WHEN** the device is offline or has unsent changes
- **THEN** the app shows a visible indicator with the number of changes waiting to sync

### Requirement: Conflict protection
The system SHALL detect when a member saves a change to a record that was changed on another device since it was loaded. It SHALL NOT silently overwrite the other change. It SHALL show both versions and let the member choose which to keep.

#### Scenario: Both members edit the same receipt
- **WHEN** member A and member B both change the same receipt starting from the same version
- **AND** member A's change reaches the backend first
- **THEN** when member B's change arrives, member B is shown both versions of the changed fields
- **AND** member B chooses which value to keep for each conflicting field

#### Scenario: Edits to different receipts never conflict
- **WHEN** member A edits one receipt and member B edits a different receipt at the same time
- **THEN** both changes are saved without any conflict prompt

### Requirement: Data privacy in transit and at rest
The system SHALL use encrypted connections for all traffic. It SHALL serve receipt images and data only to signed-in members. It SHALL store the AI service key only in the device's own on-device storage, never hardcoded in the app or committed to source control, and SHALL let a member remove it from a device.

#### Scenario: Image link cannot be opened by outsiders
- **WHEN** someone who is not signed in opens the web address of a receipt image
- **THEN** the image is not returned

#### Scenario: Remove the AI key from a device
- **WHEN** a member chooses "Remove AI key from this device" in Settings
- **THEN** the key is deleted from that device
- **AND** that device can no longer read receipts automatically until a key is entered again, though it can still view and edit existing data
