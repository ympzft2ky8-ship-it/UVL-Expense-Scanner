# Spec Delta

## Purpose

Gets a clear, readable image or PDF of a receipt or invoice into the app, so that automatic reading starts from the best possible input.

## ADDED Requirements

### Requirement: Capture with the camera
The system SHALL let a member photograph a receipt or invoice with the device camera from a prominent "Scan" button on the home screen of the app.

#### Scenario: Scan a paper receipt
- **WHEN** a member taps "Scan" and takes a photo of a receipt
- **THEN** the app shows the photo for confirmation before it is read

### Requirement: Import photos and PDFs
The system SHALL let a member import a photo from the photo library or files, or a PDF, including a PDF with several pages. It SHALL treat all pages of one PDF as one receipt or invoice.

#### Scenario: Import a PDF invoice
- **WHEN** a member imports a 2-page PDF invoice from Files
- **THEN** both pages are attached to one receipt and read together

#### Scenario: Import a Notes document scan
- **WHEN** a member shares a PDF created with the iPhone Notes "Scan Documents" feature
- **THEN** it is imported the same way as any other PDF

#### Scenario: Unsupported file
- **WHEN** a member imports a file that is not a photo or PDF
- **THEN** the app explains which file types are supported and imports nothing

### Requirement: Multi-page capture
The system SHALL let a member add more photos to the same receipt before it is read, for long receipts or multi-page paper invoices.

#### Scenario: Long receipt in two photos
- **WHEN** a member photographs the top half of a long receipt, taps "Add page", and photographs the bottom half
- **THEN** both photos are read together as one receipt

### Requirement: Straighten and crop
The system SHALL automatically detect the receipt's edges and straighten and crop the photo. It SHALL let the member adjust the four corners by hand when detection is wrong or fails.

#### Scenario: Automatic crop
- **WHEN** a photo is taken of a receipt lying at an angle on a table
- **THEN** the confirmation screen shows the receipt cropped and straightened

#### Scenario: Manual corner adjustment
- **WHEN** edge detection fails or the member taps "Adjust"
- **THEN** the member can drag four corner handles to mark the receipt, and the image is straightened to those corners

### Requirement: Image quality check
The system SHALL check each captured photo for blur, glare, darkness and too-small text before reading. It SHALL warn the member and offer a retake when any check fails. It SHALL still let the member continue.

#### Scenario: Blurry photo
- **WHEN** a member takes a blurry photo
- **THEN** the app says the photo looks blurry and offers "Retake" or "Use anyway"

### Requirement: Keep the original image
The system SHALL keep the captured image or PDF with its receipt for as long as the receipt exists, and SHALL let the member view it at full size with zoom.

#### Scenario: View the original while editing
- **WHEN** a member opens a saved receipt
- **THEN** the member can open the original image and zoom in to check values

### Requirement: Offline scan queue
The system SHALL let a member capture receipts while offline. It SHALL keep them in a visible "waiting to read" queue on the device and SHALL read them automatically once online.

#### Scenario: Scan in a basement with no signal
- **WHEN** a member scans two receipts with no connection
- **THEN** both appear as "waiting to read"
- **AND** when the phone is back online they are read, and each opens for review with a notification badge

#### Scenario: Queue survives app restart
- **WHEN** the app is closed and reopened while scans are waiting
- **THEN** the waiting scans are still in the queue

### Requirement: Duplicate scan warning
The system SHALL warn the member when a new receipt appears to duplicate one already saved: same vendor, same date and same total, or the same invoice number from the same vendor. It SHALL let the member save it anyway or discard it.

#### Scenario: Same receipt scanned twice
- **WHEN** a member scans a receipt with the same vendor, date and total as a saved receipt
- **THEN** the review screen shows "This looks like a receipt you already saved" with a link to it
