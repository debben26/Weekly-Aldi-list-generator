import { writesObservation } from "@/app/receipts/observations";

// TripPaidBackfillService — receipt → trip paid-price backfill (pure builders, no DB). A receipt
// linked to a TripSnapshot OWNS that trip's paid data: per-item paidPrice is the sum of the
// receipt's matched line totals for that item, and totalPaid is the receipt total (set by the DB
// layer in src/app/receipts/trip-link.ts). This is a deliberate, narrow exception to the
// frozen-snapshot rule (spec 10.3): paid prices are new facts about the trip, not catalog edits.

export type BackfillLine = {
  matchedItemId: string | null;
  matchStatus: string;
  lineTotal: number;
};

export type BackfillSnapshotItem = {
  id: string;
  itemId: string | null;
};

export type PaidUpdate = {
  snapshotItemId: string;
  paidPrice: number | null;
};

// Sum line totals per matched item. Only lines with a resolved match (same predicate that gates
// price observations) count; needs_review suggestions and unmatched/skipped lines contribute
// nothing.
export function paidByItem(lines: BackfillLine[]): Map<string, number> {
  const sums = new Map<string, number>();
  for (const l of lines) {
    if (!writesObservation(l.matchStatus, l.matchedItemId)) continue;
    const itemId = l.matchedItemId as string;
    sums.set(itemId, (sums.get(itemId) ?? 0) + l.lineTotal);
  }
  return sums;
}

/**
 * Build a FULL recompute of the trip's item paid prices: one update per snapshot item. The first
 * snapshot item (in the given order) with a matching itemId receives that item's summed line
 * total; duplicates beyond the first, free-text items (itemId null), and items the receipt has no
 * matched line for all get null. Total recompute keeps the sync idempotent across confirm/change/
 * skip — stale values are always cleared.
 */
export function buildPaidUpdates(
  lines: BackfillLine[],
  snapshotItems: BackfillSnapshotItem[],
): PaidUpdate[] {
  const remaining = paidByItem(lines);
  return snapshotItems.map((si) => {
    let paidPrice: number | null = null;
    if (si.itemId != null && remaining.has(si.itemId)) {
      paidPrice = remaining.get(si.itemId)!;
      remaining.delete(si.itemId); // first item wins; duplicates get null
    }
    return { snapshotItemId: si.id, paidPrice };
  });
}
