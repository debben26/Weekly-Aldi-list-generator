import { prisma } from "@/lib/prisma";
import { computeUnitPrice } from "@/services/PriceObservationService";

// Receipt → price-observation writing (phase2-receipts-spec.md §6.3 / M3). A matched receipt line is
// a real PAID observation (source_type = receipt, confidence high), kept distinct from estimated
// prices. Plain module (like match.ts / review.ts) so it is unit/integration testable.

// Statuses that represent a CONFIRMED item match (not a mere suggestion). Only these write an
// observation; needs_review (a low-confidence suggestion the user hasn't accepted) and unmatched
// lines write none (§6.3). auto_matched counts: ≥0.85 is a high-confidence, resolved match.
const MATCHED_STATUSES = new Set(["auto_matched", "confirmed", "new_item"]);

export function writesObservation(matchStatus: string, matchedItemId: string | null): boolean {
  return matchedItemId != null && MATCHED_STATUSES.has(matchStatus);
}

/**
 * Keep a receipt line's price observation in sync with its current match state (idempotent): remove
 * any prior observation for this line, then — if the line is matched — write a fresh receipt-sourced
 * one. Called whenever a line's match changes (import auto-match, confirm/change, create-new, skip),
 * so re-matching never leaves a stale or duplicate observation.
 */
export async function syncLineObservation(lineId: string): Promise<void> {
  const line = await prisma.receiptLineItem.findUnique({
    where: { id: lineId },
    select: {
      id: true,
      quantity: true,
      unitPrice: true,
      lineTotal: true,
      matchedItemId: true,
      matchStatus: true,
      receipt: { select: { storeId: true, purchaseDate: true, currency: true } },
      matchedItem: { select: { purchaseUnit: true } },
    },
  });
  if (!line) return;

  // Clear any prior observation for this line first, so a re-match (or a skip) never leaves a
  // stale/duplicate row behind.
  await prisma.priceObservation.deleteMany({ where: { receiptLineItemId: line.id } });

  if (!writesObservation(line.matchStatus, line.matchedItemId)) return;

  const lineTotal = Number(line.lineTotal);
  // Prefer the line's stored unit_price (derived at import); fall back defensively.
  const unitPrice =
    line.unitPrice != null ? Number(line.unitPrice) : computeUnitPrice(lineTotal, line.quantity);
  const unitLabel = line.matchedItem?.purchaseUnit ?? null;

  await prisma.priceObservation.create({
    data: {
      itemId: line.matchedItemId!,
      storeId: line.receipt.storeId,
      amount: lineTotal, // amount = line_total (§6.3)
      currency: line.receipt.currency,
      quantityBasis: `${line.quantity}${unitLabel ? ` ${unitLabel}` : ""}`, // quantity (+ purchase unit)
      unitPrice, // per purchase unit where known
      observedDate: line.receipt.purchaseDate, // observed_date = purchase_date
      sourceType: "receipt", // real paid price
      confidence: "high",
      receiptLineItemId: line.id,
    },
  });
}
