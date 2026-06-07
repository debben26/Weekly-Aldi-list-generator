import { describe, it, expect } from "vitest";
import { parseAndValidate, dedupeHash } from "@/services/ReceiptImportService";

// The Appendix A example (phase2-receipts-spec.md) — a known-good import.
const VALID = {
  store: "Aldi - Peshtigo, WI",
  purchase_date: "2026-06-05",
  currency: "USD",
  subtotal: 18.84,
  tax: 0.55,
  total: 19.39,
  lines: [
    { raw_name: "SHRD CHDR CHS", quantity: 1, unit_price: 2.19, line_total: 2.19 },
    { raw_name: "WHOLE MILK GAL", quantity: 1, unit_price: 2.79, line_total: 2.79 },
    { raw_name: "BANANAS", quantity: 3, unit_price: 0.19, line_total: 0.57 },
    { raw_name: "GRND BEEF 80/20", quantity: 1, unit_price: 4.49, line_total: 4.49 },
    { raw_name: "TORTILLA FLOUR", quantity: 1, unit_price: 1.69, line_total: 1.69 },
    { raw_name: "PAPER TOWELS 6PK", quantity: 1, unit_price: 6.49, line_total: 6.49 },
  ],
};

// A fully-reconciling receipt: line totals sum to subtotal, and subtotal + tax = total.
// (The Appendix A example above intentionally does NOT reconcile — its line sum is $0.62 under its
// stated subtotal, which exercises the "warn, don't block" path.)
const CLEAN = {
  store: "Aldi",
  purchase_date: "2026-06-05",
  currency: "USD",
  subtotal: 4.98,
  tax: 0.3,
  total: 5.28,
  lines: [
    { raw_name: "SHRD CHDR CHS", quantity: 1, unit_price: 2.19, line_total: 2.19 },
    { raw_name: "WHOLE MILK GAL", quantity: 1, unit_price: 2.79, line_total: 2.79 },
  ],
};

const json = (o: unknown) => JSON.stringify(o);

describe("parseAndValidate — happy path (§7.1 / Appendix A)", () => {
  it("accepts the Appendix A example (warns on its known subtotal discrepancy, never blocks)", () => {
    const r = parseAndValidate(json(VALID));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    // Appendix A's line sum is under its subtotal by $0.62 → exactly one (line-sum) warning.
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toMatch(/subtotal/i);
    expect(r.receipt.store).toBe("Aldi - Peshtigo, WI");
    expect(r.receipt.purchaseDate).toBe("2026-06-05");
    expect(r.receipt.currency).toBe("USD");
    expect(r.receipt.total).toBe(19.39);
    expect(r.receipt.lines).toHaveLength(6);
    expect(r.receipt.dedupeHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("preserves raw_name verbatim and derives a normalized name", () => {
    const r = parseAndValidate(json(VALID));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const cheese = r.receipt.lines[0];
    expect(cheese.rawName).toBe("SHRD CHDR CHS"); // verbatim (§0.8)
    expect(cheese.normalizedName).toBe("shrd chdr chs"); // normalizeText lowercases (chs <=3 chars: unchanged)
  });

  it("defaults currency to USD when omitted", () => {
    const { currency, ...rest } = VALID;
    void currency;
    const r = parseAndValidate(json(rest));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.receipt.currency).toBe("USD");
  });
});

describe("parseAndValidate — unit_price derivation (§7.2)", () => {
  it("derives unit_price = line_total / quantity when absent", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "BANANAS", quantity: 3, line_total: 0.57 }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.receipt.lines[0].unitPrice).toBeCloseTo(0.19, 5);
  });

  it("defaults quantity to 1 when omitted", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "MILK", line_total: 2.79 }] }),
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.receipt.lines[0].quantity).toBe(1);
    expect(r.receipt.lines[0].unitPrice).toBe(2.79);
  });
});

describe("parseAndValidate — hard validation rejects malformed input (§7.2)", () => {
  it("rejects non-JSON / fenced output", () => {
    const r = parseAndValidate("```json\n{}\n```");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/JSON/i);
  });

  it("rejects a missing required field (total)", () => {
    const { total, ...rest } = VALID;
    void total;
    const r = parseAndValidate(json(rest));
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/total/);
  });

  it("rejects a wrong-typed number (total as string)", () => {
    const r = parseAndValidate(json({ ...VALID, total: "19.39" }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/total.*number/);
  });

  it("rejects a numeric line_total provided as a string", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "MILK", quantity: 1, line_total: "2.79" }] }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects empty lines", () => {
    const r = parseAndValidate(json({ ...VALID, lines: [] }));
    expect(r).toMatchObject({ ok: false });
    if (r.ok) return;
    expect(r.error).toMatch(/lines/);
  });

  it("rejects an empty raw_name", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "   ", quantity: 1, line_total: 1 }] }),
    );
    expect(r.ok).toBe(false);
  });

  it("rejects a non-positive quantity", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "MILK", quantity: 0, line_total: 1 }] }),
    );
    expect(r.ok).toBe(false);
  });

  it("accepts a negative line_total (coupon lines legitimately go negative)", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "COUPON DISCOUNT", quantity: 1, line_total: -1 }] }),
    );
    expect(r.ok).toBe(true);
  });

  it("rejects a raw_name that normalizes to an empty string (symbol-only)", () => {
    const r = parseAndValidate(
      json({ ...VALID, lines: [{ raw_name: "---", quantity: 1, line_total: 0 }] }),
    );
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.error).toMatch(/normalizes to an empty/i);
  });

  it("rejects a non-ISO purchase_date", () => {
    const r = parseAndValidate(json({ ...VALID, purchase_date: "06/05/2026" }));
    expect(r.ok).toBe(false);
  });

  it("rejects an impossible calendar date", () => {
    const r = parseAndValidate(json({ ...VALID, purchase_date: "2026-13-40" }));
    expect(r.ok).toBe(false);
  });
});

describe("parseAndValidate — reconciliation warns but allows proceed (§7.2)", () => {
  it("passes silently within tolerance", () => {
    const r = parseAndValidate(json(CLEAN));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
  });

  it("warns (does not block) when line totals don't match subtotal", () => {
    // Drop a line so the sum no longer reconciles to the stated subtotal.
    const r = parseAndValidate(json({ ...VALID, lines: VALID.lines.slice(0, 3) }));
    expect(r.ok).toBe(true); // NOT blocked
    if (!r.ok) return;
    expect(r.warnings.length).toBeGreaterThan(0);
    expect(r.warnings[0]).toMatch(/subtotal/i);
  });

  it("warns when subtotal + tax != total", () => {
    const r = parseAndValidate(json({ ...VALID, tax: 5.0 }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.some((w) => /total/i.test(w))).toBe(true);
  });

  it("skips checks it can't run when subtotal/tax are omitted", () => {
    const { subtotal, tax, ...rest } = VALID;
    void subtotal;
    void tax;
    const r = parseAndValidate(json(rest));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings).toEqual([]);
  });
});

describe("dedupeHash (§7.2)", () => {
  it("is stable for the same (store, date, total)", () => {
    expect(dedupeHash("Aldi", "2026-06-05", 19.39)).toBe(dedupeHash("Aldi", "2026-06-05", 19.39));
  });

  it("ignores insignificant store case/whitespace and total formatting", () => {
    expect(dedupeHash("  ALDI  ", "2026-06-05", 19.39)).toBe(dedupeHash("aldi", "2026-06-05", 19.39));
    expect(dedupeHash("Aldi", "2026-06-05", 19.39)).toBe(dedupeHash("Aldi", "2026-06-05", 19.3900001));
  });

  it("differs when the date or total differs", () => {
    expect(dedupeHash("Aldi", "2026-06-05", 19.39)).not.toBe(dedupeHash("Aldi", "2026-06-06", 19.39));
    expect(dedupeHash("Aldi", "2026-06-05", 19.39)).not.toBe(dedupeHash("Aldi", "2026-06-05", 20.0));
  });
});
