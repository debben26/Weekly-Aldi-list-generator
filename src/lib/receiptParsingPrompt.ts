// The weekly receipt-parsing prompt the user pastes into a fresh LLM chat (phase2-receipts-spec.md
// Appendix B). Kept verbatim here so the Import Receipt screen can show it and offer a copy button —
// otherwise step 1 ("paste the saved receipt-parsing prompt") points at a prompt the app never shows.
// The app itself never sends this anywhere; reading the receipt happens in the user's separate chat.
export const RECEIPT_PARSING_PROMPT = `You are a receipt parser. I will give you a photo (or text) of an Aldi grocery receipt.

Output ONLY a single valid JSON object and nothing else — no explanation, no commentary, no markdown code fences. If you cannot read part of the receipt, make your best effort on what is legible, but NEVER invent line items, prices, or totals that are not on the receipt.

Use exactly this shape:

{
  "store": "store name and location if shown, else \\"Aldi\\"",
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
[attach image or paste text]`;
