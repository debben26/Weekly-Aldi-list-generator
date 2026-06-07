import { describe, it, expect, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import { addRestock } from "@/app/grocery-list/restock";
import { completeTrip } from "@/app/grocery-list/complete";

// Spec 6.10/6.11 + 6.13/8.2: adding a restock for an item already on the list (here a weekly
// staple) must PRESERVE provenance — the row keeps both sources — so the completed snapshot carries
// a "Restock" label and the restock rule's last_purchased_date is bumped (cadence learning).
// Self-contained: creates a throwaway item/rule/list and cleans everything up.

const TAG = `ITEST-RESTOCK-${Date.now()}`;
const WEEK = new Date("2026-10-04");
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

describe("addRestock preserves provenance on an existing list row (spec 6.10/6.11)", () => {
  it("appends a restock source to a staple row, is idempotent, and feeds restock learning", async () => {
    const household = await getDefaultHousehold();
    const store = await getDefaultStore();

    const item = await prisma.item.create({
      data: { canonicalName: `${TAG} Paper Towels`, purchaseUnit: "roll", aldiFriendly: true },
    });
    itemId = item.id;

    const rule = await prisma.stapleRule.create({
      data: {
        householdId: household.id,
        itemId: item.id,
        ruleType: "restock",
        defaultQuantity: 1,
        defaultUnit: "roll",
        expectedIntervalDays: 42,
      },
    });

    // The item is already on the list as a weekly staple.
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
              displayName: `${TAG} Paper Towels`,
              quantity: 1,
              unit: "roll",
              checked: true,
              sourceSummary: "Weekly Staples",
              sources: { create: [{ sourceType: "weekly_staple", quantity: 1, unit: "roll" }] },
            },
          ],
        },
      },
    });
    listId = list.id;

    // Add restock for the same item — should NOT create a new row.
    await addRestock(list.id, rule.id);
    // Idempotent: a second add must not duplicate the restock source.
    await addRestock(list.id, rule.id);

    const rows = await prisma.shoppingListItem.findMany({
      where: { shoppingListId: list.id },
      include: { sources: true },
    });
    expect(rows).toHaveLength(1); // still one merged row
    const row = rows[0];
    const types = row.sources.map((s) => s.sourceType).sort();
    expect(types).toEqual(["restock", "weekly_staple"]); // both sources preserved, no duplicate
    expect(row.sourceSummary).toContain("Restock");
    expect(row.sourceSummary).toContain("Weekly Staples");

    // Completing the trip freezes a snapshot whose labels include "Restock" and bumps cadence.
    snapshotId = await completeTrip(list.id);
    const snap = await prisma.tripSnapshot.findUnique({ where: { id: snapshotId }, include: { items: true } });
    expect(snap!.items).toHaveLength(1);
    expect(snap!.items[0].sourceLabels).toContain("Restock");
    expect(snap!.items[0].sourceLabels).toContain("Weekly Staples");

    // Restock learning sees the purchase: last_purchased_date is now set.
    const updatedRule = await prisma.stapleRule.findUnique({ where: { id: rule.id } });
    expect(updatedRule!.lastPurchasedDate).not.toBeNull();
  });
});
