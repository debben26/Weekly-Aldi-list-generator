import { prisma } from "@/lib/prisma";
import { getDefaultStore } from "@/lib/context";
import { parseAndValidate } from "@/services/ReceiptImportService";

// Receipt import core (phase2-receipts-spec.md §6.1 / M1). Plain module (like grocery-list/
// restock.ts and complete.ts) so it is unit/integration testable; the "use server" action in
// actions.ts is a thin wrapper over this.
//
// Order of operations:
//   1. Validate HARD (Appendix A / §7) — malformed input is rejected, never coerced.
//   2. De-dupe (block) on the (store, purchase_date, total) hash — same receipt can't import twice.
//   3. If reconciliation produced warnings and the user hasn't acknowledged them, pause for
//      confirmation (warnings never block — the user may proceed).
//   4. Persist Receipt + ReceiptLineItem rows, with raw_import_json and each raw_name verbatim.
//      Matching/observations/estimation come in later milestones.

function isUniqueViolation(e: unknown): boolean {
  return (
    typeof e === "object" &&
    e !== null &&
    (e as Record<string, unknown>).code === "P2002"
  );
}

export type ImportResult =
  | { status: "error"; error: string }
  | { status: "duplicate"; error: string }
  | { status: "needs_confirmation"; warnings: string[] }
  | { status: "imported"; receiptId: string; warnings: string[] };

export async function importReceipt(
  jsonText: string,
  opts: { acknowledgeWarnings?: boolean } = {},
): Promise<ImportResult> {
  const result = parseAndValidate(jsonText);
  if (!result.ok) return { status: "error", error: result.error };

  const { receipt, warnings, parsed } = result;

  // De-dupe (block) — §7.2.
  const dup = await prisma.receipt.findUnique({
    where: { dedupeHash: receipt.dedupeHash },
    select: { purchaseDate: true },
  });
  if (dup) {
    return {
      status: "duplicate",
      error: `This receipt was already imported (${receipt.store}, ${receipt.purchaseDate}). Duplicate imports are blocked.`,
    };
  }

  // Reconciliation warnings never block, but we let the user confirm before storing.
  if (warnings.length > 0 && !opts.acknowledgeWarnings) {
    return { status: "needs_confirmation", warnings };
  }

  try {
    const store = await getDefaultStore();
    const created = await prisma.receipt.create({
      data: {
        storeId: store.id,
        purchaseDate: new Date(`${receipt.purchaseDate}T00:00:00.000Z`),
        currency: receipt.currency,
        subtotal: receipt.subtotal,
        tax: receipt.tax,
        total: receipt.total,
        rawImportJson: parsed as object, // original object, preserved verbatim (§0.8)
        importStatus: "pending_review",
        dedupeHash: receipt.dedupeHash,
        lines: {
          create: receipt.lines.map((l) => ({
            rawName: l.rawName, // verbatim
            normalizedName: l.normalizedName,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            lineTotal: l.lineTotal,
            // matchStatus defaults to `unmatched`; matching happens in M2.
          })),
        },
      },
      select: { id: true },
    });
    return { status: "imported", receiptId: created.id, warnings };
  } catch (e: unknown) {
    // P2002 = unique constraint → race-condition duplicate
    if (isUniqueViolation(e)) {
      return {
        status: "duplicate",
        error: `This receipt was already imported (${receipt.store}, ${receipt.purchaseDate}). Duplicate imports are blocked.`,
      };
    }
    return { status: "error", error: e instanceof Error ? e.message : String(e) };
  }
}
