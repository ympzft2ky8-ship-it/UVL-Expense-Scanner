---
name: extraction-eval
description: Measure receipt-reading accuracy of UVL Expense Scanner against the private sample receipts and their answer keys; draft and verify answer keys for newly uploaded samples; compare two versions of the prompt/model; check the release gate. Use when samples are added to samples/receipts, before any release, and after any change to extraction prompt, schema, model, effort or image preprocessing.
---

# Extraction accuracy eval

Accuracy is the product's top priority, so it is measured, not eyeballed. Design reference: D10 in `openspec/changes/add-expense-tracker-mvp/design.md`. Release gate: the "Accuracy target" requirement in the receipt-extraction spec.

## Sample layout

```
samples/receipts/
  README.md                         how the owners upload samples
  inbox/                            raw uploads from the owners (not yet keyed)
  examples/<id>.<jpg|png|pdf>       used as worked examples in the prompt; never scored
  examples/<id>.expected.json
  test/<id>.<jpg|png|pdf>           scored; never shown to the model as examples
  test/<id>.expected.json
  manifest.json                     id -> {split, source, tags[], verified_by, verified_at}
```

- `<id>` is `YYYYMMDD-vendor-slug-NN`, for example `20260812-home-depot-01`.
- Tags describe what makes a sample hard: `thermal-faded`, `handwritten`, `multi-page`, `long`, `pdf`, `out-of-state`, `return`, `discount`, `mixed-labor-materials`, `no-address`, `per-line-tax-flags`.

## Keying new samples (inbox → examples/test)

1. For each file in `inbox/`, read the image yourself and draft `<id>.expected.json`. It must conform to the extraction schema in `packages/shared/src/extraction/schema.ts`, with money as string decimals. Add `"verified_by": null`.
2. List every value you were unsure of in a table for the owners, and ask them to confirm against the paper receipt. **An answer key is not valid until an owner has confirmed it.** Set `verified_by` and `verified_at` only after they do.
3. Split: about 3 samples go to `examples/`. Choose layouts that teach something, such as a mixed labor/materials contractor invoice and a receipt with per-line tax flags. Everything else goes to `test/`. Keep the tag mix balanced in `test/`.
4. Never move a sample from `test/` to `examples/` without replacing it in `test/`, and note the change in the manifest.

## Running

```
npm run eval:extraction -- --split test [--model claude-opus-5] [--effort high] [--label my-change]
```

- **This calls the paid API.** A full run of 30 receipts costs about $2–3. Tell the user the estimated cost and get approval before running.
- Output: `evals/extraction/reports/<date>-<label>.md` plus a raw JSON of every result.
- To compare two versions, run both with different `--label` values. Then run `npm run eval:compare -- <reportA> <reportB>`.

## Scoring rules

| Field | Correct when |
|---|---|
| total, subtotal, tax, line amounts | exact to the cent |
| date | exact |
| vendor name | equal after lowercasing and removing punctuation, "inc/llc/corp", and store numbers |
| state | exact 2-letter code (a `null` answer on a no-address sample is correct) |
| line matching | lines are paired by amount first, then description similarity; unmatched lines count as missed or extra |
| line kind (labor/materials/other) | exact, per matched line |
| category suggestion | informational only; not part of the gate |

**Unflagged error:** a wrong value whose field was not marked needs-check after the consistency checks ran. This is the most important number, because unflagged errors reach the ledger unnoticed.

## Release gate (from the spec)

- total, date and vendor are correct on ≥ 97% of test receipts
- line amounts are correct on ≥ 95% of all test lines
- **0** unflagged errors on total, date and line amounts

## Report format

The report must contain:
- the headline table (per-field accuracy and unflagged-error counts) with the gate status;
- cost per receipt;
- a table of every wrong value (sample id, field, expected, got, flagged?);
- failures grouped by tag.

When comparing two versions, lead with the unflagged-error delta.

## When results regress

Look at the grouped failures before changing anything. Fix the cause in this order:
1. image preprocessing (crop, resolution, segmenting);
2. prompt rules;
3. schema clarity;
4. worked examples;
5. only last, the model or effort.

Re-run and commit the new report. Never "fix" a score by editing an answer key unless an owner confirms the key was wrong.
