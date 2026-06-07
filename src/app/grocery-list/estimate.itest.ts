import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { prisma } from "@/lib/prisma";
import { estimateListOrder } from "@/app/grocery-list/estimate";
import { DEFAULT_TAX_RATE } from "@/lib/constants";

// Spec phase2 §8.1/§8.2 / M4: the total-order estimate sums per-item estimates (known/sparse/unknown)
// scaled by quantity, taxes only taxable items, and reports how much is backed by real history.
// Self-contained: its own household/store/section/items/observations so it never depends on seed data.

const TAG = `ITEST-M4-${Date.now()}`;
const NOW = new Date("2026-06-07T00:00:00.000Z"); // fixed so the 6-month window is deterministic

let householdId = "";
let storeId = "";
let sectionId = "";
let milkId = "";
let towelsId = "";
let unknownId = "";
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
  const household = await prisma.household.create({ data: { name: `${TAG} HH` }, select: { id: true } });
  householdId = household.id;
  const store = await prisma.store.create({ data: { name: `${TAG} Store` }, select: { id: true } });
  storeId = store.id;
  const section = await prisma.storeSection.create({
    data: { storeId, name: `${TAG} Dairy`, sortOrder: 0 },
    select: { id: true },
  });
  sectionId = section.id;

  const milk = await prisma.item.create({
    data: { canonicalName: `${TAG} Milk`, purchaseUnit: "gallon", taxable: false, defaultSectionId: sectionId },
    select: { id: true },
  });
  milkId = milk.id;
  const towels = await prisma.item.create({
    data: { canonicalName: `${TAG} Towels`, purchaseUnit: "each", taxable: true, defaultSectionId: sectionId },
    select: { id: true },
  });
  towelsId = towels.id;
  const unknown = await prisma.item.create({
    // same section as milk, but no observations → section-average fallback
    data: { canonicalName: `${TAG} Mystery`, purchaseUnit: "each", taxable: false, defaultSectionId: sectionId },
    select: { id: true },
  });
  unknownId = unknown.id;

  await prisma.priceObservation.createMany({
    data: [
      obs(milkId, 2.0, "2026-02-01"),
      obs(milkId, 2.5, "2026-03-01"),
      obs(milkId, 3.0, "2026-04-01"),
      obs(milkId, 3.5, "2026-05-01"), // milk: 4 obs → known, median 2.75
      obs(towelsId, 6.0, "2026-05-15"), // towels: 1 obs → sparse, point 6.0
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
        ],
      },
    },
    select: { id: true },
  });
  listId = list.id;
});

afterAll(async () => {
  const itemIds = [milkId, towelsId, unknownId];
  await prisma.priceObservation.deleteMany({ where: { itemId: { in: itemIds } } });
  if (listId) await prisma.shoppingList.delete({ where: { id: listId } }); // cascades items
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  if (storeId) await prisma.store.delete({ where: { id: storeId } }); // cascades sections
  if (householdId) await prisma.household.delete({ where: { id: householdId } });
  await prisma.$disconnect();
});

describe("estimateListOrder (phase2 §8.1/§8.2 / M4)", () => {
  it("produces known/sparse/unknown lines, taxes only taxable items, and summarizes history", async () => {
    const e = await estimateListOrder(listId, NOW);
    expect(e).not.toBeNull();
    if (!e) return;

    const milk = e.lines.find((l) => l.displayName === `${TAG} Milk`)!;
    const towels = e.lines.find((l) => l.displayName === `${TAG} Towels`)!;
    const mystery = e.lines.find((l) => l.displayName === `${TAG} Mystery`)!;

    // Known: 4 receipts → median 2.75, high confidence, backed by history.
    expect(milk.confidence).toBe("high");
    expect(milk.point).toBe(2.75);
    expect(milk.fromHistory).toBe(true);

    // Sparse: 1 receipt → point 6.0 each, ×2 qty = 12.0, medium, taxable.
    expect(towels.confidence).toBe("medium");
    expect(towels.point).toBe(12.0);
    expect(towels.taxable).toBe(true);
    expect(towels.fromHistory).toBe(true);

    // Unknown: no history → section average of the OTHER items with history in this section
    // (milk 2.75 + towels 6.0 per-unit → 4.375 → 4.38). Low confidence, not from history.
    expect(mystery.confidence).toBe("low");
    expect(mystery.fromHistory).toBe(false);
    expect(mystery.basis).toMatch(/section average/);
    expect(mystery.point).toBe(4.38);

    // Subtotal = 2.75 + 12.0 + 4.38 = 19.13; only towels taxed.
    expect(e.subtotal.point).toBe(19.13);
    expect(e.tax.point).toBe(Math.round(12.0 * DEFAULT_TAX_RATE * 100) / 100); // 0.66
    expect(e.total.point).toBe(Math.round((19.13 + 12.0 * DEFAULT_TAX_RATE) * 100) / 100); // 19.79

    expect(e.summary).toBe("2 of 3 items based on real history");
  });
});
