// ReceiptImportService — pure validation + de-dupe for receipt imports
// (phase2-receipts-spec.md §6.1 / §7 / Appendix A). NO Prisma, NO LLM, NO network: this is the
// deterministic contract enforcer. Persistence lives in the server action.
//
// The boundary: an external chat parses a receipt image into raw JSON (Appendix A); this service
// validates that JSON HARD (malformed input is rejected with a clear message, never coerced) and
// reconciles totals SOFT (a subtotal/total mismatch only warns — coupons/deposits legitimately
// break the math).

import crypto from "node:crypto";
import { normalizeText } from "@/services/ItemMergeService";
import { computeUnitPrice } from "@/services/PriceObservationService";

export type ValidatedLine = {
  rawName: string; // verbatim from the chat output (§0.8)
  normalizedName: string; // derived via normalizeText — drives matching + alias learning (M2)
  quantity: number;
  unitPrice: number | null; // derived from line_total / quantity when the chat omits it (§7.2)
  lineTotal: number;
};

export type ValidatedReceipt = {
  store: string; // raw store string, verbatim
  purchaseDate: string; // ISO YYYY-MM-DD
  currency: string;
  subtotal: number | null;
  tax: number | null;
  total: number;
  lines: ValidatedLine[];
  dedupeHash: string; // hash(store + purchase_date + total) — blocks duplicate imports (§7.2)
};

export type ParseResult =
  | { ok: true; receipt: ValidatedReceipt; warnings: string[]; parsed: unknown }
  | { ok: false; error: string };

// Reconciliation tolerances (§7.2).
const ABS_TOLERANCE = 0.05; // $0.05
const SUBTOTAL_PCT_TOLERANCE = 0.005; // 0.5% of subtotal

// ---------- de-dupe ----------

// Deterministic hash of (store, purchase_date, total) (§7.2). Store is normalized to ignore
// insignificant case/whitespace differences; total is fixed to 2 decimals so 19.39 and 19.390
// collide as intended.
export function dedupeHash(store: string, purchaseDate: string, total: number): string {
  const key = `${store.trim().toLowerCase().replace(/\s+/g, " ")}|${purchaseDate}|${total.toFixed(2)}`;
  return crypto.createHash("sha256").update(key).digest("hex");
}

// ---------- helpers ----------

function isFiniteNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

// Strict ISO calendar date (YYYY-MM-DD) that also actually exists (rejects 2026-13-40).
function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const [y, m, d] = v.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

// ---------- the contract ----------

export function parseAndValidate(jsonText: string): ParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    return {
      ok: false,
      error:
        "Could not parse the file as JSON. If the chat wrapped the output in ``` fences or added " +
        "any text before or after the object, delete that and keep only the { ... } object.",
    };
  }

  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Expected a single JSON object at the top level." };
  }
  const obj = parsed as Record<string, unknown>;

  // store (required, non-empty string)
  if (typeof obj.store !== "string" || obj.store.trim() === "") {
    return { ok: false, error: 'Field "store" is required and must be a non-empty string.' };
  }
  const store = obj.store;

  // purchase_date (required, ISO date)
  if (!isIsoDate(obj.purchase_date)) {
    return {
      ok: false,
      error: 'Field "purchase_date" is required and must be an ISO date (YYYY-MM-DD).',
    };
  }
  const purchaseDate = obj.purchase_date;

  // currency (default "USD"; reject a present-but-wrong type)
  if (obj.currency !== undefined && typeof obj.currency !== "string") {
    return { ok: false, error: 'Field "currency" must be a string.' };
  }
  const currency = typeof obj.currency === "string" && obj.currency.trim() ? obj.currency : "USD";

  // subtotal / tax (optional; if present must be numbers, not strings)
  if (obj.subtotal !== undefined && obj.subtotal !== null && !isFiniteNumber(obj.subtotal)) {
    return { ok: false, error: 'Field "subtotal" must be a number.' };
  }
  if (obj.tax !== undefined && obj.tax !== null && !isFiniteNumber(obj.tax)) {
    return { ok: false, error: 'Field "tax" must be a number.' };
  }
  const subtotal = isFiniteNumber(obj.subtotal) ? obj.subtotal : null;
  const tax = isFiniteNumber(obj.tax) ? obj.tax : null;

  // total (required number)
  if (!isFiniteNumber(obj.total)) {
    return { ok: false, error: 'Field "total" is required and must be a number.' };
  }
  const total = obj.total;

  // lines (required, non-empty array)
  if (!Array.isArray(obj.lines) || obj.lines.length === 0) {
    return { ok: false, error: 'Field "lines" is required and must be a non-empty array.' };
  }

  const lines: ValidatedLine[] = [];
  for (let i = 0; i < obj.lines.length; i++) {
    const raw = obj.lines[i];
    const where = `Line ${i + 1}`;
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      return { ok: false, error: `${where}: each line must be an object.` };
    }
    const line = raw as Record<string, unknown>;

    if (typeof line.raw_name !== "string" || line.raw_name.trim() === "") {
      return { ok: false, error: `${where}: "raw_name" is required and must be a non-empty string.` };
    }

    // quantity defaults to 1 when omitted; if present it must be a positive number.
    let quantity: number;
    if (line.quantity === undefined || line.quantity === null) {
      quantity = 1;
    } else if (isFiniteNumber(line.quantity) && line.quantity > 0) {
      quantity = line.quantity;
    } else {
      return { ok: false, error: `${where}: "quantity" must be a positive number.` };
    }

    if (!isFiniteNumber(line.line_total)) {
      return { ok: false, error: `${where}: "line_total" is required and must be a number.` };
    }
    const lineTotal = line.line_total;

    if (line.unit_price !== undefined && line.unit_price !== null && !isFiniteNumber(line.unit_price)) {
      return { ok: false, error: `${where}: "unit_price" must be a number.` };
    }
    // Derive unit_price from line_total / quantity when absent (§7.2).
    const unitPrice = isFiniteNumber(line.unit_price)
      ? line.unit_price
      : computeUnitPrice(lineTotal, quantity);

    const normalizedName = normalizeText(line.raw_name);
    if (normalizedName === "") {
      return { ok: false, error: `${where}: "raw_name" normalizes to an empty string — use a real product name.` };
    }
    lines.push({
      rawName: line.raw_name,
      normalizedName,
      quantity,
      unitPrice,
      lineTotal,
    });
  }

  // Reconciliation — WARN, never block (§7.2): coupons, deposits, and rounding legitimately
  // break the arithmetic, so the user is allowed to proceed.
  const warnings: string[] = [];
  if (subtotal !== null) {
    const sum = lines.reduce((a, l) => a + l.lineTotal, 0);
    const tol = Math.max(ABS_TOLERANCE, SUBTOTAL_PCT_TOLERANCE * Math.abs(subtotal));
    if (Math.abs(sum - subtotal) > tol) {
      warnings.push(
        `Line totals add up to ${sum.toFixed(2)}, but the receipt subtotal is ${subtotal.toFixed(2)} ` +
          `(off by ${Math.abs(sum - subtotal).toFixed(2)}). Coupons or deposits can cause this — you can still proceed.`,
      );
    }
  }
  if (subtotal !== null && tax !== null) {
    if (Math.abs(subtotal + tax - total) > ABS_TOLERANCE) {
      warnings.push(
        `Subtotal ${subtotal.toFixed(2)} + tax ${tax.toFixed(2)} = ${(subtotal + tax).toFixed(2)}, ` +
          `but the receipt total is ${total.toFixed(2)} (off by ${Math.abs(subtotal + tax - total).toFixed(2)}). You can still proceed.`,
      );
    }
  }

  return {
    ok: true,
    receipt: {
      store,
      purchaseDate,
      currency,
      subtotal,
      tax,
      total,
      lines,
      dedupeHash: dedupeHash(store, purchaseDate, total),
    },
    warnings,
    parsed,
  };
}
