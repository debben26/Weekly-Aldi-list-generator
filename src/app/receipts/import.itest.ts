import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { importReceipt } from "@/app/receipts/import";

// Spec phase2 §6.1 / M1: importReceipt validates, de-dupes, and persists a Receipt + lines with
// raw_import_json and raw_name preserved verbatim. Reconciliation warnings pause for confirmation
// but never block; malformed input is rejected. Self-contained: tags receipts and cleans up.

const TAG = `ITEST-RCPT-${Date.now()}`;
const createdReceiptIds: string[] = [];

// A fully-reconciling receipt (line sum = subtotal; subtotal + tax = total) → imports silently.
const clean = {
  store: `${TAG} Aldi`,
  purchase_date: "2026-06-05",
  currency: "USD",
  subtotal: 4.98,
  tax: 0.3,
  total: 5.28,
  lines: [
    { raw_name: "SHRD CHDR CHS", quantity: 1, unit_price: 2.19, line_total: 2.19 },
    { raw_name: "WHOLE MILK GAL", quantity: 3, line_total: 2.79 }, // unit_price omitted → derived
  ],
};

afterAll(async () => {
  if (createdReceiptIds.length) {
    await prisma.receipt.deleteMany({ where: { id: { in: createdReceiptIds } } }); // cascades lines
  }
  await prisma.$disconnect();
});

describe("importReceipt (phase2 §6.1 / M1)", () => {
  it("persists a valid receipt with raw JSON + raw_name preserved verbatim", async () => {
    const jsonText = JSON.stringify(clean);
    const res = await importReceipt(jsonText);
    expect(res.status).toBe("imported");
    if (res.status !== "imported") return;
    createdReceiptIds.push(res.receiptId);

    const saved = await prisma.receipt.findUnique({
      where: { id: res.receiptId },
      include: { lines: true },
    });
    expect(saved).not.toBeNull();
    expect(saved!.importStatus).toBe("pending_review");
    expect(Number(saved!.total)).toBe(5.28);

    // raw_import_json preserved verbatim (round-trips to the original object).
    expect(saved!.rawImportJson).toEqual(JSON.parse(jsonText));

    // raw_name verbatim; unit_price derived where the chat omitted it.
    const milk = saved!.lines.find((l) => l.rawName === "WHOLE MILK GAL");
    expect(milk).toBeTruthy();
    expect(milk!.normalizedName).toBe("whole milk gal");
    expect(Number(milk!.unitPrice)).toBeCloseTo(2.79 / 3, 4);
    expect(saved!.lines.every((l) => l.matchStatus === "unmatched")).toBe(true);
  });

  it("blocks a duplicate (store, purchase_date, total) import", async () => {
    const dupRes = await importReceipt(JSON.stringify(clean));
    expect(dupRes.status).toBe("duplicate");
    if (dupRes.status === "imported") createdReceiptIds.push(dupRes.receiptId);
  });

  it("pauses for confirmation on a reconciliation mismatch, then imports when acknowledged", async () => {
    const mismatch = { ...clean, store: `${TAG} Aldi B`, subtotal: 99.99 };
    const pending = await importReceipt(JSON.stringify(mismatch));
    expect(pending.status).toBe("needs_confirmation");
    if (pending.status === "needs_confirmation") {
      expect(pending.warnings.length).toBeGreaterThan(0);
    }

    const proceed = await importReceipt(JSON.stringify(mismatch), { acknowledgeWarnings: true });
    expect(proceed.status).toBe("imported");
    if (proceed.status === "imported") createdReceiptIds.push(proceed.receiptId);
  });

  it("rejects malformed JSON without persisting", async () => {
    const before = await prisma.receipt.count();
    const res = await importReceipt('{ "store": "x" }'); // missing required fields
    expect(res.status).toBe("error");
    const after = await prisma.receipt.count();
    expect(after).toBe(before);
  });
});
