---
name: receipt-extraction
description: Rules and workflow for how UVL Expense Scanner reads receipts and invoices with Claude — the extraction prompt, JSON schema, labor/materials/other classification, NY sales tax handling, state detection, confidence flags, consistency checks and the targeted re-read. Use whenever writing or changing extraction code, the system prompt, the output schema, image preprocessing, or the model/effort settings.
---

# Receipt extraction

The behavior contract is `openspec/changes/add-expense-tracker-mvp/specs/receipt-extraction/spec.md` (after archive: `openspec/specs/receipt-extraction/spec.md`). Architecture decisions are D5, D6 and D10 in that change's `design.md`. This skill covers the rules the extraction code and prompt must follow.

## Where things live

| What | Path |
|---|---|
| Output JSON schema + TS types | `packages/shared/src/extraction/schema.ts` |
| Consistency checks (a–e) | `packages/shared/src/extraction/checks.ts` |
| System prompt + worked examples | `apps/api/src/extraction/prompt.ts` |
| Claude API call, re-read, cost metering | `apps/api/src/extraction/extract.ts` |
| Price table, model id, effort | `apps/api/src/config.ts` |

The eval harness (`evals/extraction`) imports the **same** prompt and schema modules. Never fork a copy for the eval.

## Non-negotiable rules

1. **Never invent values.** If a field is not printed or written on the document, return `null`. The only computed values are those the spec allows (for example, the tax rate from tax ÷ taxable subtotal), and they must be marked `computed: true`.
2. **The model's confidence is advisory.** The deterministic checks in `checks.ts` always override it. A field involved in a failed check is `needs-check` even if the model said `high`.
3. **The review screen always follows.** Extraction output is a draft. Nothing enters the ledger without a member tapping Save.
4. **Any change to the prompt, schema, model, effort or image preprocessing requires running the eval** (see the `extraction-eval` skill) and committing the report. The PR description must show before/after numbers.
5. **Worked examples come only from `samples/receipts/examples/`**, never from `samples/receipts/test/`. Using test receipts in the prompt invalidates the scores.

## API call settings

Before touching the call itself, load the `claude-api` skill for the current SDK patterns.

- SDK: `@anthropic-ai/sdk` (TypeScript), called only from the Worker. The key is the Worker secret `ANTHROPIC_API_KEY` and is never sent to the client.
- Model `claude-opus-5`, `thinking: {type: "adaptive"}`, `output_config: {effort: "high", format: {type: "json_schema", ...}}`.
- Refusal fallbacks enabled (`fallbacks: "default"` with its beta header). Always check `stop_reason` before reading content.
- Images: prefer a short-lived signed R2 URL as the image source, so the Worker does not base64 large files (free-tier CPU limit). Send PDFs as `document` blocks.
- Tall receipts (aspect ratio above about 3:1) are sent as overlapping segments in one request, in top-to-bottom order, with a text note saying they are consecutive parts of one receipt.
- Changing the model (for example to `claude-sonnet-5` to save cost) is the owners' decision. Only propose it with eval numbers showing no accuracy loss.

## Classification rules the prompt must encode

**Line kind:**
- `labor`: work performed. Hours, installation, service calls, contractor labor, cleaning services, "service", "install", "repair labor".
- `materials`: physical goods. Lumber, fixtures, paint, appliances, hardware, supplies.
- `other`: delivery, fuel or trip charges, disposal or dumpster fees, permits, equipment rental, restocking fees, receipt-level discounts, deposits.
- Mixed lines ("Install faucet incl. parts") are `labor`, with a low-confidence flag so the member can split them.

**State:** read it from the vendor or store address (the store address wins over a corporate HQ address). If there is no address, return `null`. The app then suggests NY and requires confirmation. Never default to NY inside the model output.

**Tax:**
- Read each tax line as printed, with its rate when shown. When the receipt marks taxable items (T, TX or * flags), set `taxed` per line; otherwise use `null`.
- NY context for the prompt:
  - The combined state and local rate is usually 7–8.875% (NYC 8.875%).
  - Contractors' **capital improvement** work is not subject to sales tax (the customer gives Form ST-124), so a labor line with no tax is normal and not an error.
  - Repair and maintenance services **are** taxable in NY.

**Category suggestion:** return `suggested_category` from the list for the property type (see the `tax-categories` skill) and `category_is_clear`. For rental lines that could be either a repair or an improvement, `category_is_clear` must be `false`.

**Not a receipt:** set `is_receipt: false`, with a short reason.

## Confidence

Mark a field `low` when it is:
- faded, handwritten, folded, cut off or partially covered;
- read from a crowded or ambiguous layout (for example, which column is the amount); or
- a digit that could be read two ways (1/7, 5/6, 0/8).

Everything else is `high`.

## Consistency checks (implemented in `checks.ts`, run on Worker and client)

- a. qty × unit price = line amount (±$0.01)
- b. Σ lines − discounts = subtotal (±$0.01)
- c. subtotal + tax + other charges = total (±$0.01)
- d. The date is not in the future and falls within the ledger year (the previous year is allowed until it is closed)
- e. The effective tax rate is between 0% and 10%

## Targeted re-read

If check a, b or c fails, make **one** follow-up call with the same document plus a plain statement of the discrepancy. For example: "The line amounts you read sum to $142.10 but the subtotal you read is $124.10. Re-read the subtotal and each line amount carefully." Accept the new values only if the checks now pass; otherwise keep the first result with the fields flagged. Never loop more than once.

## Money

Every amount crosses the schema as a **string decimal** (for example `"19.89"`) and is converted to integer cents in `packages/shared`. Never use floating-point math on money.
