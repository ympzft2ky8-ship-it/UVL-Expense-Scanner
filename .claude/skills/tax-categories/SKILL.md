---
name: tax-categories
description: Urban Vibes Living's expense category lists, tax treatment labels, repair-vs-improvement guidance, and NY sales tax facts, for a multi-member real-estate LLC (partnership) with rental and flip properties. Use when implementing or changing categories, category suggestions, tax labels, export summaries, or any UI copy about taxes.
---

# UVL tax categories and treatment

The contract is the expense-categories spec in the current OpenSpec change (after archive: `openspec/specs/expense-categories/spec.md`). The code source of truth is `packages/shared/src/categories.ts`. Keep this skill, the spec and that file in sync.

> The app **organizes records for the accountant; it does not give tax advice.** UI copy must never tell users what is deductible. Use the neutral labels below. The export's About sheet carries the disclaimer.

## Business facts

- Urban Vibes Living LLC is a multi-member LLC owned by the two members and **taxed as a partnership (Form 1065)**.
- **Rental properties:** partnership rental real estate income and expenses are reported on **Form 8825**, not Schedule E.
  - Ordinary repairs and maintenance are generally deducted in the year paid.
  - **Improvements** are capitalized and depreciated; residential rental buildings generally over 27.5 years.
- **Flips** (property bought to resell): the property is generally treated as inventory, or dealer property.
  - Acquisition, renovation and holding costs are generally **added to the property's cost basis**, and recovered when it sells (cost of goods sold, Form 1125-A).
  - Selling costs (commissions, transfer taxes paid by the seller) reduce the sale proceeds.
- **Overhead:** business costs not tied to one property.

The owners' accountant decides the final treatment and any elections (see the safe harbors below). The app only captures what the accountant needs.

## Category lists (must match the spec exactly)

| Property type | Category | Tax treatment label |
|---|---|---|
| Rental | Repairs & Maintenance | Deduct this year |
| Rental | Capital Improvement | Capitalize & depreciate |
| Rental | Supplies | Deduct this year |
| Rental | Cleaning & Maintenance Services | Deduct this year |
| Rental | Utilities | Deduct this year |
| Rental | Insurance | Deduct this year |
| Rental | Property Taxes | Deduct this year |
| Rental | Mortgage Interest | Deduct this year |
| Rental | HOA / Condo Fees | Deduct this year |
| Rental | Legal & Professional | Deduct this year |
| Rental | Advertising | Deduct this year |
| Rental | Travel & Auto | Deduct this year |
| Rental | Other Rental Expense | Deduct this year |
| Flip | Acquisition & Closing Costs | Add to property cost |
| Flip | Renovation | Add to property cost |
| Flip | Holding Costs – Utilities | Add to property cost |
| Flip | Holding Costs – Insurance | Add to property cost |
| Flip | Holding Costs – Property Taxes | Add to property cost |
| Flip | Holding Costs – Interest | Add to property cost |
| Flip | Selling Costs | Reduces sale proceeds |
| Flip | Other Flip Cost | Add to property cost |
| Overhead | Office & Supplies | Deduct this year |
| Overhead | Software & Subscriptions | Deduct this year |
| Overhead | Legal & Professional | Deduct this year |
| Overhead | Bank & Merchant Fees | Deduct this year |
| Overhead | Insurance | Deduct this year |
| Overhead | Travel & Auto | Deduct this year |
| Overhead | Meals | Deduct this year |
| Overhead | Education | Deduct this year |
| Overhead | Licenses & Fees | Deduct this year |
| Overhead | Other Business Expense | Deduct this year |

Labor / Materials / Other is a separate dimension on each line, not a category. Summaries show it inside each category.

## Repair vs improvement (rental lines)

Never default silently. When unclear, flag the line as needs-check and show this hint:

> **Repair**: keeps the property in normal working condition (fix a leak, patch drywall, replace a broken part with a similar one).
> **Improvement**: makes it *better* (an upgrade or addition), *restores* it after major wear or damage (e.g. a whole new roof), or *adapts* it to a new use.

The IRS calls this the "betterment, restoration, adaptation" test. Examples for suggestions:

| Clear repair | Clear improvement | Ambiguous → ask |
|---|---|---|
| unclog drain, service call | new addition or deck | water heater |
| patch or paint a single room | full kitchen or bath remodel | roof work |
| replace a broken window pane | new HVAC system | flooring |
| fix a faucet | whole-house rewiring | windows (several) |

**Accountant's safe harbors.** These are elections the accountant makes; the app does not apply them. The data model must keep enough detail for them:
- **De minimis safe harbor:** items up to $2,500 per invoice or per item can often be expensed if elected. Keep invoice totals and per-line amounts.
- **Routine maintenance safe harbor.**
- **Small taxpayer safe harbor:** for buildings with unadjusted basis up to $1M, if annual repairs and improvements on that building stay under the lesser of $10,000 or 2% of basis. Keep per-property yearly totals.

## NY sales tax facts (for extraction and checks)

- The state rate is 4%, plus local rates that vary by county or city. Combined rates are typically 7%–8.875%; NYC is 8.875%. Record tax **as printed**; never "correct" it.
- A contractor's charge for a **capital improvement** is not subject to sales tax when the customer gives the contractor **Form ST-124**. Untaxed labor on improvement invoices is normal.
- Charges for **repair, maintenance and installation services** to real property that are not capital improvements are generally taxable.
- Out-of-state purchases: record the state and tax printed on the receipt. Use tax questions go to the accountant.

## Changing categories

Categories appear in the spec, in `categories.ts`, in export summaries and in category memory. To change them:
1. update the spec through an OpenSpec change;
2. add a data migration that remaps existing lines;
3. update this table;
4. update the export tests.
