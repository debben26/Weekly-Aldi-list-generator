import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { estimateListOrder } from "@/app/grocery-list/estimate";
import { DEFAULT_TAX_RATE } from "@/lib/constants";

// Self-contained estimate coverage: creates its own household/store/sections/items/observations
// so it never depends on seed data.

const TAG = `ITEST-M4-${Date.now()}`;
const NOW = new Date("2026-06-07T00:00:00.000Z");

let householdId = "";
let storeId = "";
let sectionId = "";
let earlySectionId = "";
let milkId = "";
let towelsId = "";
let unknownId = "";
let bananasId = "";
let listId = "";

const obs = (itemId: string, unitPrice: number, isoDate: string) => ({
  itemId,
  storeId,
  amount: unitPrice,
  unitPrice,
  observedDate: new Date(`${isoDate}T00:00:00.000Z`),
  sourceType: "receipt" as const,
});

beforeAll(async () => {
  const household = await prisma.household.create({
    data: { name: `${TAG} HH` },
    select: { id: true },
  });
  householdId = household.id;
  const store = await prisma.store.create({
    data: { name: `${TAG} Store` },
    select: { id: true },
  });
  storeId = store.id;
  const section = await prisma.storeSection.create({
    data: { storeId, name: `${TAG} Dairy`, sortOrder: 0 },
    select: { id: true },
  });
  sectionId = section.id;
  const earlySection = await prisma.storeSection.create({
    data: { storeId, name: `${TAG} Produce`, sortOrder: -1 },
    select: { id: true },
  });
  earlySectionId = earlySection.id;

  const milk = await prisma.item.create({
    data: {
      canonicalName: `${TAG} Milk`,
      purchaseUnit: "gallon",
      taxable: false,
      defaultSectionId: sectionId,
    },
    select: { id: true },
  });
  milkId = milk.id;
  const towels = await prisma.item.create({
    data: {
      canonicalName: `${TAG} Towels`,
      purchaseUnit: "each",
      taxable: true,
      defaultSectionId: sectionId,
    },
    select: { id: true },
  });
  towelsId = towels.id;
  const unknown = await prisma.item.create({
    data: {
      canonicalName: `${TAG} Mystery`,
      purchaseUnit: "each",
      taxable: false,
      defaultSectionId: sectionId,
    },
    select: { id: true },
  });
  unknownId = unknown.id;
  const bananas = await prisma.item.create({
    data: {
      canonicalName: `${TAG} Z Bananas`,
      purchaseUnit: "bag",
      taxable: false,
      defaultSectionId: earlySectionId,
    },
    select: { id: true },
  });
  bananasId = bananas.id;

  await prisma.priceObservation.createMany({
    data: [
      obs(milkId, 2.0, "2026-02-01"),
      obs(milkId, 2.5, "2026-03-01"),
      obs(milkId, 3.0, "2026-04-01"),
      obs(milkId, 3.5, "2026-05-01"),
      obs(towelsId, 6.0, "2026-05-15"),
      obs(bananasId, 1.5, "2026-05-20"),
      {
        itemId: milkId,
        storeId,
        amount: 9.99,
        unitPrice: 9.99,
        observedDate: new Date("2026-05-25T00:00:00.000Z"),
        sourceType: "manual" as const,
        confidence: "manual catalog",
      },
    ],
  });

  const list = await prisma.shoppingList.create({
    data: {
      householdId,
      storeId,
      weekStart: new Date("2026-06-01T00:00:00.000Z"),
      items: {
        create: [
          { displayName: `${TAG} Milk`, itemId: milkId, quantity: 1, sectionId },
          { displayName: `${TAG} Towels`, itemId: towelsId, quantity: 2, sectionId },
          { displayName: `${TAG} Mystery`, itemId: unknownId, quantity: 1, sectionId },
          { displayName: `${TAG} Z Bananas`, itemId: bananasId, quantity: 1, sectionId: earlySectionId },
        ],
      },
    },
    select: { id: true },
  });
  listId = list.id;
});

afterAll(async () => {
  const itemIds = [milkId, towelsId, unknownId, bananasId];
  await prisma.priceObservation.deleteMany({ where: { itemId: { in: itemIds } } });
  if (listId) await prisma.shoppingList.delete({ where: { id: listId } });
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  if (storeId) await prisma.store.delete({ where: { id: storeId } });
  if (householdId) await prisma.household.delete({ where: { id: householdId } });
  await prisma.$disconnect();
});

describe("estimateListOrder", () => {
  it("estimates totals and returns lines sorted by store section then item name", async () => {
    const e = await estimateListOrder(listId, NOW);
    expect(e).not.toBeNull();
    if (!e) return;

    const milk = e.lines.find((l) => l.displayName === `${TAG} Milk`)!;
    const towels = e.lines.find((l) => l.displayName === `${TAG} Towels`)!;
    const mystery = e.lines.find((l) => l.displayName === `${TAG} Mystery`)!;
    const bananas = e.lines.find((l) => l.displayName === `${TAG} Z Bananas`)!;

    expect(milk.confidence).toBe("medium");
    expect(milk.point).toBe(9.99);
    expect(milk.basis).toBe("manual catalog override");
    expect(milk.fromHistory).toBe(false);

    expect(towels.confidence).toBe("medium");
    expect(towels.point).toBe(12.0);
    expect(towels.taxable).toBe(true);
    expect(towels.fromHistory).toBe(true);

    expect(mystery.confidence).toBe("low");
    expect(mystery.fromHistory).toBe(false);
    expect(mystery.basis).toMatch(/section average/);
    expect(mystery.point).toBe(4.38);

    expect(bananas.sectionName).toBe(`${TAG} Produce`);
    expect(e.lines.map((l) => l.displayName)).toEqual([
      `${TAG} Z Bananas`,
      `${TAG} Milk`,
      `${TAG} Mystery`,
      `${TAG} Towels`,
    ]);

    expect(e.subtotal.point).toBe(27.87);
    expect(e.tax.point).toBe(Math.round(12.0 * DEFAULT_TAX_RATE * 100) / 100);
    expect(e.total.point).toBe(Math.round((27.87 + 12.0 * DEFAULT_TAX_RATE) * 100) / 100);

    expect(e.summary).toBe("2 of 4 items based on real history");
  });

  it("does not multiply a per-purchase-unit price by a recipe-unit quantity", async () => {
    // Milk priced per gallon (catalog override 9.99); a row of "3 cup" must estimate as ONE
    // purchase unit, not 3 × 9.99. A unit-less quantity still scales (plain count), and a
    // quantity in the purchase unit scales too.
    const cupRow = await prisma.shoppingListItem.create({
      data: { shoppingListId: listId, displayName: `${TAG} Cup Milk`, itemId: milkId, quantity: 3, unit: "cup", sectionId },
      select: { id: true },
    });
    const gallonRow = await prisma.shoppingListItem.create({
      data: { shoppingListId: listId, displayName: `${TAG} Gallon Milk`, itemId: milkId, quantity: 2, unit: "gallon", sectionId },
      select: { id: true },
    });
    try {
      const e = await estimateListOrder(listId, NOW);
      expect(e).not.toBeNull();
      if (!e) return;
      const cup = e.lines.find((l) => l.displayName === `${TAG} Cup Milk`)!;
      const gallon = e.lines.find((l) => l.displayName === `${TAG} Gallon Milk`)!;
      expect(cup.quantity).toBe(1);
      expect(cup.point).toBe(9.99);
      expect(gallon.quantity).toBe(2);
      expect(gallon.point).toBe(19.98);
    } finally {
      await prisma.shoppingListItem.deleteMany({ where: { id: { in: [cupRow.id, gallonRow.id] } } });
    }
  });
});
