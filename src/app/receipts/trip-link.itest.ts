import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { linkReceiptToTrip, syncTripPaidData } from "@/app/receipts/trip-link";
import { skipLine } from "@/app/receipts/review";

// Receipt → trip link: a linked receipt OWNS the trip's paid data. Linking backfills per-item
// paidPrice (summed matched line totals) and totalPaid (= receipt.total); review mutations resync;
// unlink/relink moves the data; deleting the trip leaves the receipt (SetNull). Self-contained:
// tags all rows and cleans up.

const TAG = `ITEST-TRIPLINK-${Date.now()}`;

let householdId: string;
let storeId: string;
let itemAId: string;
let itemBId: string;
let snap1Id: string;
let snap2Id: string;
let receiptId: string;
let lineBId: string; // the receipt line matched to item B (skipped mid-test)

async function createSnapshot(suffix: string): Promise<string> {
  const snap = await prisma.tripSnapshot.create({
    data: {
      householdId,
      weekStart: new Date("2026-06-01T00:00:00.000Z"),
      completedAt: new Date("2026-06-06T00:00:00.000Z"),
      storeName: `${TAG} Aldi ${suffix}`,
      totalEstimated: 20,
      itemCount: 4,
      items: {
        create: [
          { displayName: `${TAG} A`, itemId: itemAId, checked: true },
          { displayName: `${TAG} A dup`, itemId: itemAId, checked: true }, // duplicate itemId
          { displayName: `${TAG} B`, itemId: itemBId, checked: true },
          { displayName: `${TAG} free text`, itemId: null, checked: true },
        ],
      },
    },
    select: { id: true },
  });
  return snap.id;
}

async function paidState(snapId: string) {
  const snap = await prisma.tripSnapshot.findUnique({
    where: { id: snapId },
    select: {
      totalPaid: true,
      items: { orderBy: { id: "asc" }, select: { itemId: true, paidPrice: true } },
    },
  });
  return {
    totalPaid: snap!.totalPaid != null ? Number(snap!.totalPaid) : null,
    items: snap!.items.map((i) => ({
      itemId: i.itemId,
      paidPrice: i.paidPrice != null ? Number(i.paidPrice) : null,
    })),
  };
}

beforeAll(async () => {
  const household = await prisma.household.create({
    data: { name: `${TAG} HH` },
    select: { id: true },
  });
  householdId = household.id;
  const store = await prisma.store.create({ data: { name: `${TAG} Store` }, select: { id: true } });
  storeId = store.id;

  const itemA = await prisma.item.create({
    data: { canonicalName: `${TAG} Item A`, purchaseUnit: "each" },
    select: { id: true },
  });
  itemAId = itemA.id;
  const itemB = await prisma.item.create({
    data: { canonicalName: `${TAG} Item B`, purchaseUnit: "each" },
    select: { id: true },
  });
  itemBId = itemB.id;

  snap1Id = await createSnapshot("1");
  snap2Id = await createSnapshot("2");

  // Receipt with resolved + unresolved lines, created directly so match state is deterministic.
  const receipt = await prisma.receipt.create({
    data: {
      storeId,
      purchaseDate: new Date("2026-06-06T00:00:00.000Z"),
      total: 12.34, // > line sum: tax lives at receipt level
      rawImportJson: {},
      importStatus: "pending_review",
      dedupeHash: TAG,
      lines: {
        create: [
          // Two resolved lines for item A → summed.
          { rawName: `${TAG} a1`, normalizedName: `${TAG.toLowerCase()} a1`, quantity: 1, lineTotal: 3.0, matchedItemId: itemAId, matchStatus: "confirmed", matchConfidence: 1 },
          { rawName: `${TAG} a2`, normalizedName: `${TAG.toLowerCase()} a2`, quantity: 1, lineTotal: 2.0, matchedItemId: itemAId, matchStatus: "auto_matched", matchConfidence: 1 },
          // One resolved line for item B.
          { rawName: `${TAG} b`, normalizedName: `${TAG.toLowerCase()} b`, quantity: 1, lineTotal: 4.5, matchedItemId: itemBId, matchStatus: "confirmed", matchConfidence: 1 },
          // Unresolved suggestion → contributes nothing.
          { rawName: `${TAG} sug`, normalizedName: `${TAG.toLowerCase()} sug`, quantity: 1, lineTotal: 1.0, matchedItemId: itemBId, matchStatus: "needs_review", matchConfidence: 0.5 },
        ],
      },
    },
    select: { id: true, lines: { select: { id: true, rawName: true } } },
  });
  receiptId = receipt.id;
  lineBId = receipt.lines.find((l) => l.rawName === `${TAG} b`)!.id;
});

afterAll(async () => {
  const lines = await prisma.receiptLineItem.findMany({
    where: { receiptId },
    select: { id: true },
  });
  await prisma.priceObservation.deleteMany({
    where: { receiptLineItemId: { in: lines.map((l) => l.id) } },
  });
  await prisma.receipt.deleteMany({ where: { id: receiptId } });
  await prisma.tripSnapshot.deleteMany({ where: { householdId } }); // cascades snapshot items
  await prisma.item.deleteMany({ where: { id: { in: [itemAId, itemBId] } } });
  await prisma.store.deleteMany({ where: { id: storeId } });
  await prisma.household.deleteMany({ where: { id: householdId } });
  await prisma.$disconnect();
});

describe("receipt → trip paid backfill", () => {
  it("link backfills per-item paidPrice and totalPaid = receipt.total", async () => {
    const res = await linkReceiptToTrip(receiptId, snap1Id);
    expect(res).toEqual({ ok: true });

    const state = await paidState(snap1Id);
    expect(state.totalPaid).toBe(12.34);
    // First item-A row gets the 3.00 + 2.00 sum; the duplicate, the unresolved-suggestion item is
    // still counted for B (4.50 from its confirmed line only), and free-text rows stay null.
    expect(state.items.map((i) => i.paidPrice)).toEqual([5.0, null, 4.5, null]);
  });

  it("blocks linking a second receipt to the same trip", async () => {
    const other = await prisma.receipt.create({
      data: {
        storeId,
        purchaseDate: new Date("2026-06-07T00:00:00.000Z"),
        total: 1,
        rawImportJson: {},
        dedupeHash: `${TAG}-other`,
      },
      select: { id: true },
    });
    const res = await linkReceiptToTrip(other.id, snap1Id);
    expect(res.ok).toBe(false);
    await prisma.receipt.delete({ where: { id: other.id } });
  });

  it("resyncs when a line is skipped in review (paidPrice cleared, totalPaid unchanged)", async () => {
    await skipLine(lineBId);
    const state = await paidState(snap1Id);
    expect(state.items.map((i) => i.paidPrice)).toEqual([5.0, null, null, null]);
    expect(state.totalPaid).toBe(12.34);
  });

  it("unlink clears the trip's paid data; relink moves it to the new trip", async () => {
    const unlink = await linkReceiptToTrip(receiptId, null);
    expect(unlink).toEqual({ ok: true });
    const cleared = await paidState(snap1Id);
    expect(cleared.totalPaid).toBeNull();
    expect(cleared.items.every((i) => i.paidPrice === null)).toBe(true);

    const relink = await linkReceiptToTrip(receiptId, snap2Id);
    expect(relink).toEqual({ ok: true });
    const moved = await paidState(snap2Id);
    expect(moved.totalPaid).toBe(12.34);
    expect(moved.items.map((i) => i.paidPrice)).toEqual([5.0, null, null, null]); // B was skipped above
  });

  it("syncTripPaidData no-ops for an unlinked receipt", async () => {
    await linkReceiptToTrip(receiptId, null);
    await expect(syncTripPaidData(receiptId)).resolves.toBeUndefined();
  });

  it("deleting the trip leaves the receipt with a null link (SetNull)", async () => {
    await linkReceiptToTrip(receiptId, snap2Id);
    await prisma.tripSnapshot.delete({ where: { id: snap2Id } });
    const receipt = await prisma.receipt.findUnique({
      where: { id: receiptId },
      select: { tripSnapshotId: true },
    });
    expect(receipt!.tripSnapshotId).toBeNull();
  });
});
