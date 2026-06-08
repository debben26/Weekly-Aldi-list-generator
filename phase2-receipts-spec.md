# Phase 2 — Receipt-Driven Cost Estimation (Implementation Spec)

> **For the coding agent (Claude Code):** This spec builds on the Phase 1 app (`spec.md`) and reuses its entities, services, and conventions. **Read Section 0 (Resolved Decisions) first** — it defines the boundary between the external receipt-reading step and the app, which is the central design choice and overrides any assumption you'd otherwise make. Everything inside the app stays deterministic and tested; no LLM runs inside the app for any part of this feature.

> **Scope note:** This spec covers *only* receipt import and cost estimation. Built-in recipe suggestions are specced separately. All other Phase 2 readiness items (multi-user, recipe URL import, in-app pickup ordering, partner APIs, product matching, substitution/out-of-stock, layout templates) are deferred to Phase 3 and must not be built here.

---

## 0. Resolved Decisions (read first)

1. **Receipt *reading* happens outside the app; receipt *processing* happens inside it.** A human pastes a saved prompt (Appendix B) plus a receipt image into a separate LLM chat each week. The chat returns raw structured JSON (Appendix A). The user saves that JSON and imports the file into the app. **The app never calls an LLM and never reads receipt images.** This keeps the only non-deterministic step (reading a photo) out of the codebase.

2. **The boundary between chat and app is a file, not a connection.** A web chat cannot write to the app's database. The integration is: chat → JSON file → app import screen → strict validation → storage. Do not build any live connector, API bridge, or MCP integration in this phase.

3. **The chat is intentionally "dumb."** It parses the receipt into *raw lines only* (`raw_name`, `quantity`, `unit_price`, `line_total`) plus header totals. It does **not** match items, because it has no access to the catalog, aliases, or import history. **Matching, learning, pricing, and totals all live in the app**, which does have that state.

4. **Matching reuses the Phase 1 `MatchingService` (spec.md 8.1b).** Receipt-line→item matching is the same problem as duplicate-merge matching. One service, used in both places. Do not write a second matching implementation.

5. **The app's estimation logic is fully deterministic** (Section 8). Three cases — known, sparse, unknown — with concrete rules. Unknown items fall back to deterministic section averages and seeded baselines, **not** an LLM guess. (The LLM's only job in this whole feature is reading the image, in the external chat.)

6. **Receipt prices are real *paid* observations, not estimates.** A matched receipt line becomes a `PriceObservation` with `source_type = receipt`. The derived per-item *estimate* is computed *from* those observations. Keep `estimated_price` vs `paid_price` separate, exactly as Phase 1 requires — do not collapse them.

7. **Imports are idempotent and validated hard.** The importer validates the JSON shape, reconciles line totals against the subtotal/total within tolerance, and de-duplicates on `(store, purchase_date, total)` so the same receipt can't be imported twice. Malformed input is rejected with a clear message, never silently coerced.

8. **The raw parse is preserved.** Store the original imported JSON and each line's `raw_name` verbatim, even after matching — same provenance discipline as Phase 1.

---

## 1. Purpose & Value

Let a household feed weekly Aldi receipts into the app so it accumulates real price history and can estimate the cost of a planned grocery list. Because receipt *reading* is handled by a separate LLM chat, the app stays offline, deterministic, and simple while still benefiting from accurate parsing of messy Aldi receipt text.

Value:
- Build a real, growing price history keyed to canonical items.
- Estimate total list cost before shopping, with a point estimate and a range.
- Improve matching automatically over time (every confirmed match teaches an alias).
- Avoid building (and maintaining) a native OCR/vision pipeline.

## 2. The Weekly Flow (end to end)

1. User shops; gets a paper or digital Aldi receipt.
2. User opens a fresh LLM chat, pastes the saved **Receipt Parsing Prompt** (Appendix B), and attaches the receipt image (or pastes digital-receipt text).
3. Chat returns JSON matching the **Import Schema** (Appendix A).
4. User saves the JSON and uploads it on the app's **Import Receipt** screen.
5. App validates → stores the receipt → auto-matches high-confidence lines → shows a **review queue** for the rest.
6. User confirms/creates matches; the app writes price observations and learns aliases.
7. Later, when planning a week, the app shows a **total-order estimate** with per-line confidence.

## 3. Scope

### In scope
External-chat receipt parsing (via a saved prompt + import schema, *not* app code); file-based receipt import with strict validation and de-duplication; receipt storage with raw JSON preserved; deterministic line→item matching with a review queue and alias learning; price observations from matched lines (`source_type = receipt`); deterministic per-item price estimation (known / sparse / unknown); deterministic total-order estimate with a range and a configurable grocery-tax flag; graceful handling of missing data.

### Out of scope (this phase)
Native in-app receipt OCR/vision/parsing; any LLM call from inside the app; live connectors or MCP bridges between chat and app; built-in recipe suggestions (separate spec); all other Phase 2 readiness items (deferred to Phase 3); multi-user; substitution/out-of-stock; partner APIs; product matching to online catalogs.

## 4. Architecture Notes

- New services: `ReceiptImportService` (validate + persist + dedupe), `PriceEstimationService` (per-item estimates), `OrderEstimationService` (list totals). Reuse the existing `MatchingService` and `PriceObservationService` from Phase 1.
- Logic in services, never in UI components. Pure functions where possible. No LLM, no network calls inside the app for this feature.
- Stays single-user/local, consistent with the Phase 1 auth posture: no real access control, run local or behind basic auth, do not deploy openly.

## 5. Domain Model (additions)

Reuse Phase 1 entities (`Item`, `ItemAlias`, `StoreSection`, `Store`, `ShoppingList`, `ShoppingListItem`, `PriceObservation`). Add:

- **Receipt**
  - `id`, `store_id`, `purchase_date`, `currency` (default USD), `subtotal` (nullable), `tax` (nullable), `total`, `raw_import_json` (the original uploaded JSON, preserved verbatim), `import_status` (`pending_review` | `completed`), `dedupe_hash` (hash of `store` + `purchase_date` + `total`), `created_at`.
- **ReceiptLineItem**
  - `id`, `receipt_id`, `raw_name` (verbatim from the chat output), `normalized_name` (derived), `quantity`, `unit_price` (nullable; derive from `line_total / quantity` when absent), `line_total`, `matched_item_id` (nullable), `match_confidence` (0–1), `match_status` (`auto_matched` | `confirmed` | `needs_review` | `unmatched` | `new_item`).
- **PriceObservation** (extend Phase 1)
  - Add `source_type = receipt` (formalizes the `future_receipt` value reserved in Phase 1) and an optional `receipt_line_item_id` link. These are **paid** prices.

Optional (nice-to-have, may defer within this phase):
- **EstimateSnapshot** — when a list's total estimate is shown, optionally store the point/low/high so estimate-vs-actual accuracy can be reported later. Mark clearly as optional in M5.

## 6. Functional Requirements

### 6.1 Import Receipt
- Upload screen accepts a `.json` file (or pasted JSON).
- Validate strictly against Appendix A (Section 7). Reject malformed input with a specific, human-readable error; never silently coerce or drop required fields.
- Reconcile: sum of `line_total` ≈ `subtotal`, and `subtotal + tax` ≈ `total`, within tolerance (Section 7.2). On mismatch, **warn and let the user proceed or cancel** (receipts have coupons, deposits, rounding) — do not hard-fail on reconciliation alone.
- De-duplicate on `dedupe_hash`. If a matching receipt exists, block the import and tell the user it's already imported.
- Persist the `Receipt`, all `ReceiptLineItem`s, and `raw_import_json` verbatim.
- Acceptance: a valid file imports and lands in the review queue; an invalid file is rejected with a clear reason; re-importing the same receipt is blocked.

### 6.2 Match & Review
- For each line, run `MatchingService` (spec.md 8.1b): normalize `raw_name`, match against `Item.canonical_name` + `ItemAlias`, produce a confidence score.
- `match_confidence ≥ 0.85` → `auto_matched`. Below → `needs_review`.
- Review queue lets the user, per line: confirm the suggested item, pick a different item, or create a new item (prompting for section + purchase unit, reusing the Phase 1 item-create flow).
- **Learning loop:** confirming a non-trivial match or creating a new item writes `normalized_name` as a new `ItemAlias` on that item, so the same Aldi abbreviation auto-matches next week.
- A receipt's `import_status` becomes `completed` when no lines remain in `needs_review`.
- Acceptance: high-confidence lines auto-match; ambiguous lines wait for review; confirming "SHRD CHDR CHS" → Shredded Cheese makes the next import of that string auto-match.

### 6.3 Write Price Observations
- Each matched line writes a `PriceObservation`: `item_id`, `store_id`, `amount = line_total`, `quantity_basis = quantity`, `unit_price` (derived per purchase unit where the unit is known), `observed_date = purchase_date`, `source_type = receipt`, `confidence = high`, link to `receipt_line_item_id`.
- Unmatched lines write no observation (but are preserved on the receipt).
- If the receipt corresponds to a completed `ShoppingList` week, optionally reconcile `paid_price` on matching list items. Keep `estimated_price` (pre-shop, derived) and `paid_price` (from receipt) distinct.
- Acceptance: importing a receipt with milk at $2.79 creates a `receipt`-sourced observation; missing/unmatched lines never break the import.

### 6.4 Per-Item Price Estimate
Deterministic (Section 8.1). For any item, return `{ point, low, high, confidence, basis, observation_count, last_observed }` using observations within a **6-month default window** (consistent with Phase 1 analytics). Three cases — known, sparse, unknown — defined in 8.1.
- Acceptance: an item with ≥3 recent observations returns a tight high-confidence estimate with an explanation; a never-seen item returns a labeled best-guess range.

### 6.5 Total-Order Estimate
Deterministic (Section 8.2). For a generated `ShoppingList`, return a point total, a `[low, high]` range, a per-line breakdown with each line's basis/confidence, and a summary (e.g. "9 of 13 items based on real history"). Apply grocery tax only to `taxable` items at a configurable rate (Section 8.3).
- Acceptance: the estimate sums per-item point estimates × quantity; the range sums lows and highs; items with no history still produce a (low-confidence) line rather than breaking the total.

### 6.6 Estimate Accuracy (optional, M5)
If `EstimateSnapshot` is implemented, after a receipt is imported for a planned week, show estimated total vs actual paid total and track accuracy over time. Clearly optional.

## 7. Import Schema & Validation (the contract)

### 7.1 Schema
The chat must output exactly this shape (see Appendix A for an annotated example):

```json
{
  "store": "string (required)",
  "purchase_date": "YYYY-MM-DD (required, ISO date)",
  "currency": "string (required, default \"USD\")",
  "subtotal": "number (optional)",
  "tax": "number (optional)",
  "total": "number (required)",
  "lines": [
    {
      "raw_name": "string (required, verbatim from receipt)",
      "quantity": "number (required, default 1)",
      "unit_price": "number (optional)",
      "line_total": "number (required, >= 0)"
    }
  ]
}
```

### 7.2 Validation rules (hard)
- Required fields present and correctly typed; numbers are numbers, not strings; no nulls in required fields. Reject otherwise.
- `purchase_date` parses as an ISO date.
- `lines` is non-empty; each line has a non-empty `raw_name`, positive `quantity`, and `line_total ≥ 0`. If `unit_price` is absent, derive it as `line_total / quantity`.
- **Reconciliation (warn, don't block):** `abs(sum(line_total) − subtotal) ≤ max($0.05, 0.5% of subtotal)` when `subtotal` is present; `abs(subtotal + tax − total) ≤ $0.05` when both present. On failure, surface a warning showing the discrepancy and let the user proceed or cancel.
- **De-dupe (block):** compute `dedupe_hash`; if a `Receipt` with that hash exists, reject as a duplicate.
- Preserve `raw_import_json` regardless of warnings.

## 8. Algorithms (deterministic)

### 8.1 Per-Item Price Estimate
Let `obs` = price observations for the item within the 6-month window, by `unit_price` where available else `amount/quantity`.

- **Known — `count(obs) ≥ 3`:**
  - `point = median(obs)`.
  - `range = [25th percentile, 75th percentile]` when `count ≥ 4`; else `[min, max]`.
  - `confidence = high`. `basis = "median of N receipts; last seen {date}"`.
- **Sparse — `count(obs) ∈ {1, 2}`:**
  - `point = most recent observation`.
  - `range = [point × 0.75, point × 1.25]`.
  - `confidence = medium`. `basis = "based on {N} recent receipt(s)"`.
- **Unknown — `count(obs) = 0`:** resolve in order, stop at first hit:
  1. **Section average:** mean of the `point` estimates of *other* items in the same `StoreSection` that have history → `range = [avg × 0.6, avg × 1.4]`, `confidence = low`, `basis = "section average ({section}), no history for this item"`.
  2. **Seeded baseline:** if the item has a seeded baseline price (Appendix A of Phase 1 / a seeded `PriceObservation` with `source_type = estimated`), use it with `range = [base × 0.7, base × 1.3]`, `confidence = low`.
  3. **Generic fallback:** wide range flagged clearly, `confidence = low`, `basis = "best guess, no data"`.
- All cases are deterministic; the same observations always yield the same estimate. No LLM.

### 8.2 Total-Order Estimate
1. For each `ShoppingListItem`, get its per-item estimate (8.1), scaled by quantity in purchase units.
2. `total_point = Σ point`, `total_low = Σ low`, `total_high = Σ high`.
3. Apply tax (8.3) to taxable items, added to point/low/high.
4. Return totals + per-line breakdown (item, qty, point, range, confidence, basis) + a summary count of how many lines are backed by real history.
5. Items with no estimate basis still contribute their low-confidence line; never omit them silently.

### 8.3 Grocery Tax
- `Item.taxable` (bool). Most Wisconsin grocery food is exempt; non-food and prepared items may be taxable. Default seeded food items to `taxable = false`, household/non-food to `taxable = true`.
- Configurable `tax_rate` in Settings (default a single combined rate). Apply only to taxable items. Keep it a flat per-item flag × rate; do not model tax brackets or jurisdictions in this phase.

### 8.4 Matching
Reuse spec.md 8.1b exactly: normalize text (lowercase, trim, strip punctuation, expand known abbreviation aliases, singularize), match against `canonical_name` + `ItemAlias`, score confidence. Auto-match at ≥ 0.85; below → review. Never auto-match on conflicting meaningful variants. Confirmed matches and new items write a `normalized_name` alias.

## 9. UI / UX

Add to navigation: **Receipts** (under History/Analytics, or its own item).
- **Import Receipt:** file upload / paste, validation feedback (errors block, reconciliation mismatches warn), duplicate detection.
- **Review Queue:** per-line suggested match + confidence, with confirm / change / create-new actions; one-tap confirm for high-confidence suggestions; progress indicator until the receipt is `completed`.
- **Receipt history:** list of imported receipts with totals and dates; drill into lines and their matched items.
- **Total-order estimate:** shown on the planned weekly list — point total prominent, range secondary, per-line confidence available on expand, and the "N of M items based on real history" summary so the user knows how much to trust it.

UX priorities: make the weekly import fast (the review queue should be short and shrink over time as aliases accumulate); make confidence and basis legible so estimates are trusted appropriately; never make a malformed import fail mysteriously.

## 10. Non-Functional Requirements
- **Determinism:** estimation, totals, and matching are deterministic and tested.
- **Data integrity:** preserve `raw_import_json` and `raw_name`; keep `estimated_price` vs `paid_price` distinct; never delete observations on item edits; receipt-sourced observations are paid prices.
- **Reliability:** missing optional fields (subtotal, tax, unit_price) never break import or estimation. Unmatched lines never block an import.
- **Privacy:** receipt *images* are sent to an external chat by the user, per receipt, by hand — the app itself stays local and makes no external calls. Document this clearly for the user. Where Aldi offers a digital/emailed receipt, pasting its text avoids sending an image at all.

## 11. Milestones

- **M1 — Import & Storage.** Import screen; Appendix A validation; reconciliation warnings; de-dupe; persist `Receipt` + `ReceiptLineItem` + raw JSON. *Done when:* a valid file imports and stores with raw JSON preserved; invalid files are rejected clearly; duplicates are blocked.
- **M2 — Matching & Review Queue.** Wire `MatchingService`; auto-match threshold; review queue with confirm/change/create-new; alias learning. *Done when:* high-confidence lines auto-match, ambiguous lines route to review, and confirming a match teaches an alias that auto-matches next time.
- **M3 — Price Observations.** Write `receipt`-sourced observations from matched lines; optional `paid_price` reconciliation on the matching week's list. *Done when:* matched lines produce observations; unmatched lines are preserved without breaking anything.
- **M4 — Estimation.** `PriceEstimationService` (8.1) and `OrderEstimationService` (8.2/8.3); total-order estimate on the weekly list with range and confidence summary. *Done when:* a planned list shows a point total, a range, and per-line confidence, degrading gracefully for no-history items.
- **M5 — Estimate Accuracy (optional).** `EstimateSnapshot` + estimated-vs-actual reporting. *Done when:* after importing a receipt for a planned week, the user can see estimate accuracy.

## 12. Testing Requirements

- Valid JSON imports; malformed JSON (missing required field, wrong type, empty `lines`) is rejected.
- `unit_price` derived from `line_total / quantity` when absent.
- Reconciliation passes within tolerance; mismatch warns but allows proceed.
- Duplicate `(store, purchase_date, total)` import is blocked.
- `raw_import_json` and `raw_name` preserved verbatim after matching.
- Confidence ≥ 0.85 auto-matches; below routes to review.
- Confirming a match (or creating an item) writes an alias; re-importing the same `raw_name` then auto-matches.
- Each matched line creates a `receipt`-sourced `PriceObservation`; unmatched lines create none and don't break import.
- **Estimate, known (≥3 obs):** point = median; range = IQR (≥4) or min/max (=3); confidence high.
- **Estimate, sparse (1–2 obs):** point = most recent; range = ±25%; confidence medium.
- **Estimate, unknown (0 obs):** section-average fallback first; then seeded baseline; then generic; confidence low; clearly labeled.
- Estimation respects the 6-month window.
- Total = Σ points; range = Σ lows … Σ highs; taxable items taxed, exempt not.
- A list containing no-history items still produces a total (those lines low-confidence, not omitted).
- `estimated_price` and `paid_price` remain separate after a receipt is reconciled to a completed week.

## 13. Guardrails

**Do not:** build native receipt OCR/vision/parsing in the app; call an LLM from inside the app for any part of this feature; build a live connector/MCP bridge between chat and app; auto-match below the confidence threshold; discard `raw_import_json` or `raw_name`; collapse `estimated_price` and `paid_price`; import the same receipt twice silently; hard-fail an import purely on a reconciliation mismatch; fabricate line items (the parsing prompt forbids inventing data); build any deferred Phase 2/3 item here.

**Do:** keep the chat dumb (raw lines only) and the app smart (matching, learning, pricing); reuse the Phase 1 `MatchingService`; validate imports hard and de-dupe; preserve raw + normalized data; keep estimation deterministic and explainable; show confidence and basis so estimates are trusted appropriately; handle missing data and brand-new items gracefully.

## 14. Definition of Done

A user can paste a saved prompt + receipt image into a separate chat, get back JSON, and import it into the app; the app validates and de-dupes the import, auto-matches known items and routes the rest to a short review queue that teaches itself over time, records real paid prices as receipt-sourced observations, and produces a deterministic total-order estimate for a planned week — with a point total, a range, and a clear indication of how much of the estimate is backed by real history versus best guesses for new items.

---

## Appendix A — Import Schema (annotated example)

The chat returns **only** this JSON — no prose, no markdown fences. Example for a small Aldi trip:

```json
{
  "store": "Aldi - Peshtigo, WI",
  "purchase_date": "2026-06-05",
  "currency": "USD",
  "subtotal": 18.84,
  "tax": 0.55,
  "total": 19.39,
  "lines": [
    { "raw_name": "SHRD CHDR CHS", "quantity": 1, "unit_price": 2.19, "line_total": 2.19 },
    { "raw_name": "WHOLE MILK GAL", "quantity": 1, "unit_price": 2.79, "line_total": 2.79 },
    { "raw_name": "BANANAS", "quantity": 3, "unit_price": 0.19, "line_total": 0.57 },
    { "raw_name": "GRND BEEF 80/20", "quantity": 1, "unit_price": 4.49, "line_total": 4.49 },
    { "raw_name": "TORTILLA FLOUR", "quantity": 1, "unit_price": 1.69, "line_total": 1.69 },
    { "raw_name": "PAPER TOWELS 6PK", "quantity": 1, "unit_price": 6.49, "line_total": 6.49 }
  ]
}
```

Notes for the importer: `raw_name` is kept verbatim (abbreviations and all) so the matcher and alias-learning have the real string to work with. `unit_price` may be omitted; derive it. `subtotal`/`tax` may be omitted; reconciliation simply skips the checks it can't run.

## Appendix B — Weekly Receipt Parsing Prompt

Paste this into a fresh chat each week, then attach the receipt photo (or paste the digital-receipt text). Save the JSON it returns and import it.

```
You are a receipt parser. I will give you a photo (or text) of an Aldi grocery receipt.

Output ONLY a single valid JSON object and nothing else — no explanation, no commentary, no markdown code fences. If you cannot read part of the receipt, make your best effort on what is legible, but NEVER invent line items, prices, or totals that are not on the receipt.

Use exactly this shape:

{
  "store": "store name and location if shown, else \"Aldi\"",
  "purchase_date": "YYYY-MM-DD",
  "currency": "USD",
  "subtotal": number or omit if not shown,
  "tax": number or omit if not shown,
  "total": number,
  "lines": [
    {
      "raw_name": "the item text EXACTLY as printed on the receipt, including abbreviations",
      "quantity": number (default 1 if not shown),
      "unit_price": number or omit if not shown,
      "line_total": number
    }
  ]
}

Rules:
- Keep raw_name verbatim — do not expand, correct, or normalize abbreviations.
- One object per line item on the receipt.
- Do not include non-item lines (subtotal, tax, total, payment, change) inside "lines"; put those in the header fields.
- All monetary values are plain numbers (e.g. 2.79), no currency symbols.
- purchase_date must be an ISO date.

Here is the receipt:
[attach image or paste text]
```

A short troubleshooting note for the user: if the chat wraps the JSON in ``` fences or adds a sentence before it, the importer will reject it — delete the extra text and keep only the `{ ... }` object. Over time the app's review queue shrinks as confirmed matches teach it your receipt's abbreviations.
