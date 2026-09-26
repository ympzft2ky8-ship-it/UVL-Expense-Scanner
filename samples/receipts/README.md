# Sample receipts (private)

These real receipts and invoices are used to **measure how accurately the app reads receipts**.

> Keep this repository **private**. Receipts contain names, addresses and card digits. Before uploading, you can cover the last card digits or personal phone numbers with a marker or a photo edit.

## How to add samples (from iPhone or computer)

1. Go to the repository on github.com and switch to the branch `claude/urban-vibes-expense-app-3herjz`.
2. Open the folder `samples/receipts/inbox/`.
3. Tap **Add file → Upload files**, pick your photos or PDFs, and tap **Commit changes**.

Any file name is fine. Photos (JPG, PNG, HEIC) and PDFs are all accepted.

## What to include (20–30 in total)

Try to cover the kinds of receipts you really get:

- hardware or big-box store receipts (Home Depot, Lowe's…), including a long one
- contractor / handyman invoices, ideally one that mixes **labor and materials**
- a faded or crumpled thermal receipt
- a handwritten invoice
- a multi-page PDF invoice (e.g. from email)
- a receipt from **outside New York**
- a return or refund receipt, and one with a discount
- utility, insurance or property tax bills, if you want those tracked too

Photograph them the way you normally would. Slightly imperfect photos are useful for the test.

## What happens next

Claude reads each receipt and drafts an **answer key**: the correct vendor, date, lines, tax and total. You then get a short list of values to confirm against the paper receipt. Once confirmed:

- about 3 receipts become worked examples for the AI (`examples/`)
- the rest become the test set (`test/`), which is never shown to the AI and is used only to score it

Details for developers: `.claude/skills/extraction-eval/SKILL.md`.
