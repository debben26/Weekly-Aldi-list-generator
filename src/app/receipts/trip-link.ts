import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/db-errors";
import { buildPaidUpdates } from "@/services/TripPaidBackfillService";

// Receipt → trip paid-data DB layer. Plain module (like match.ts / observations.ts) so it is
// unit/integration testable. A receipt linked via Receipt.tripSnapshotId OWNS the trip's paid
// data: totalPaid = receipt.total (the true amount paid, incl. tax), per-item paidPrice = summed
// matched line totals (TripPaidBackfillService). The sync is a FULL recompute, so any manually
// entered paid price on a linked trip would be overwritten on the next review action — acceptable
// while no paid-price entry UI exists.

/**
 * Recompute the linked trip's paid data from the receipt's current match state (idempotent).
 * No-ops when the receipt is unlinked, so call sites (import, every review mutation) can call it
 * unconditionally — mirrors syncLineObservation.
 */
export async function syncTripPaidData(receiptId: string): Promise<void> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: {
      tripSnapshotId: true,
      total: true,
      lines: { select: { matchedItemId: true, matchStatus: true, lineTotal: true } },
    },
  });
  if (!receipt?.tripSnapshotId) return;

  const snapshotItems = await prisma.tripSnapshotItem.findMany({
    where: { tripSnapshotId: receipt.tripSnapshotId },
    orderBy: { id: "asc" },
    select: { id: true, itemId: true },
  });

  const updates = buildPaidUpdates(
    receipt.lines.map((l) => ({
      matchedItemId: l.matchedItemId,
      matchStatus: l.matchStatus,
      lineTotal: Number(l.lineTotal),
    })),
    snapshotItems,
  );

  await prisma.$transaction([
    ...updates.map((u) =>
      prisma.tripSnapshotItem.update({
        where: { id: u.snapshotItemId },
        data: { paidPrice: u.paidPrice },
      }),
    ),
    prisma.tripSnapshot.update({
      where: { id: receipt.tripSnapshotId },
      data: { totalPaid: Number(receipt.total) },
    }),
  ]);
}

// Serializable picker option for the import form / receipt page trip selects.
export type TripOption = {
  id: string;
  storeName: string;
  weekStart: string; // ISO date
  totalEstimated: number | null;
  receiptId: string | null; // receipt already linked to this trip, if any
};

export async function loadRecentTrips(limit = 12): Promise<TripOption[]> {
  const trips = await prisma.tripSnapshot.findMany({
    orderBy: { completedAt: "desc" },
    take: limit,
    select: {
      id: true,
      storeName: true,
      weekStart: true,
      totalEstimated: true,
      receipt: { select: { id: true } },
    },
  });
  return trips.map((t) => ({
    id: t.id,
    storeName: t.storeName,
    weekStart: t.weekStart.toISOString().slice(0, 10),
    totalEstimated: t.totalEstimated != null ? Number(t.totalEstimated) : null,
    receiptId: t.receipt?.id ?? null,
  }));
}

export type LinkResult = { ok: true } | { ok: false; error: string };

/**
 * Link a receipt to a trip (or unlink with null). Relinking clears the previously linked trip's
 * paid data first so it never keeps stale values from this receipt.
 */
export async function linkReceiptToTrip(
  receiptId: string,
  tripSnapshotId: string | null,
): Promise<LinkResult> {
  const receipt = await prisma.receipt.findUnique({
    where: { id: receiptId },
    select: { tripSnapshotId: true },
  });
  if (!receipt) return { ok: false, error: "That receipt no longer exists." };
  if (receipt.tripSnapshotId === tripSnapshotId) return { ok: true }; // no change

  // Clear the previously linked trip's paid data and move the link atomically, so a failure
  // can't leave the old trip cleared while the receipt still points at it.
  try {
    await prisma.$transaction([
      ...(receipt.tripSnapshotId
        ? [
            prisma.tripSnapshotItem.updateMany({
              where: { tripSnapshotId: receipt.tripSnapshotId },
              data: { paidPrice: null },
            }),
            prisma.tripSnapshot.update({
              where: { id: receipt.tripSnapshotId },
              data: { totalPaid: null },
            }),
          ]
        : []),
      prisma.receipt.update({
        where: { id: receiptId },
        data: { tripSnapshotId },
      }),
    ]);
  } catch (e) {
    if (isUniqueViolation(e)) {
      return { ok: false, error: "That trip is already linked to another receipt." };
    }
    throw e;
  }

  if (tripSnapshotId) await syncTripPaidData(receiptId);
  return { ok: true };
}
