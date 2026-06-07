import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import { completeTrip } from "@/app/grocery-list/complete";

// Spec 10.3 (must pass): completing a trip freezes a denormalized snapshot; editing the live
// Item afterward must NOT change the snapshot. Also verifies last_purchased_date updates.
// Self-contained: creates a throwaway item + list and cleans everything up.

const TAG = `ITEST-${Date.now()}`;
const WEEK = new Date("2026-09-06");
let itemId = "";
let listId = "";
let snapshotId = "";

afterAll(async () => {
  if (snapshotId) await prisma.tripSnapshot.deleteMany({ where: { id: snapshotId } });
  if (listId) await prisma.shoppingList.deleteMany({ where: { id: listId } });
  if (itemId) {
    await prisma.priceObservation.deleteMany({ where: { itemId } });
    await prisma.stapleRule.deleteMany({ where: { itemId } });
    await prisma.item.deleteMany({ where: { id: itemId } });
  }
  await prisma.$disconnect();
});

describe("completeTrip + snapshot immutability (spec 6.13 / 10.3)", () => {
  it("freezes a snapshot, updates restock, and is immune to later Item edits", async () => {
    const household = await getDefaultHousehold();
    const store = await getDefaultStore();
    const section = await prisma.storeSection.findFirst({ where: { storeId: store.id, name: "Dairy" } });

    const item = await prisma.item.create({
      data: { canonicalName: `${TAG} Milk`, purchaseUnit: "gallon", defaultSectionId: section?.id ?? null, aldiFriendly: true },
    });
    itemId = item.id;

    // A restock rule so we can confirm last_purchased_date is bumped on completion.
    const rule = await prisma.stapleRule.create({
      data: { householdId: household.id, itemId: item.id, ruleType: "restock", expectedIntervalDays: 14 },
    });

    const list = await prisma.shoppingList.create({
      data: {
        householdId: household.id,
        storeId: store.id,
        weekStart: WEEK,
        status: "active",
        items: {
          create: [
            {
              itemId: item.id,
              displayName: `${TAG} Milk`,
              quantity: 1,
              unit: "gallon",
              sectionId: section?.id ?? null,
              checked: true,
              estimatedPrice: 3.0,
              paidPrice: 3.5,
              sourceSummary: "Weekly Staples",
              sources: { create: [{ sourceType: "weekly_staple", quantity: 1, unit: "gallon" }] },
            },
          ],
        },
      },
    });
    listId = list.id;

    // Complete the trip.
    snapshotId = await completeTrip(list.id);

    const snap = await prisma.tripSnapshot.findUnique({ where: { id: snapshotId }, include: { items: true } });
    expect(snap).not.toBeNull();
    expect(snap!.items).toHaveLength(1);
    const snapItem = snap!.items[0];
    expect(snapItem.displayName).toBe(`${TAG} Milk`);
    expect(Number(snapItem.paidPrice)).toBe(3.5);
    expect(Number(snapItem.estimatedPrice)).toBe(3.0); // estimated kept distinct from paid
    expect(snapItem.sectionName).toBe("Dairy");
    expect(snapItem.itemId).toBe(item.id); // analytics join retained

    // A price observation was recorded (paid -> manual).
    const obs = await prisma.priceObservation.findFirst({ where: { itemId: item.id } });
    expect(obs).not.toBeNull();
    expect(Number(obs!.amount)).toBe(3.5);
    expect(obs!.sourceType).toBe("manual");

    // Restock last_purchased_date was bumped (real history feeds the engine).
    const updatedRule = await prisma.stapleRule.findUnique({ where: { id: rule.id } });
    expect(updatedRule!.lastPurchasedDate).not.toBeNull();

    // EDIT the live item — the snapshot must not change.
    await prisma.item.update({
      where: { id: item.id },
      data: { canonicalName: `${TAG} EDITED`, aldiFriendly: false },
    });

    const reread = await prisma.tripSnapshotItem.findUnique({ where: { id: snapItem.id } });
    expect(reread!.displayName).toBe(`${TAG} Milk`); // frozen, NOT "EDITED"
    expect(Number(reread!.paidPrice)).toBe(3.5);
    expect(reread!.sectionName).toBe("Dairy");

    // The live item did change.
    const liveItem = await prisma.item.findUnique({ where: { id: item.id } });
    expect(liveItem!.canonicalName).toBe(`${TAG} EDITED`);
  });
});
