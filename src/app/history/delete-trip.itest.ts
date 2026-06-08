import { describe, it, expect, afterAll, vi } from "vitest";

// deleteTrip uses request-scoped Next helpers; stub them. redirect() never returns, so throw a
// tagged error we can assert on.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import { completeTrip } from "@/app/grocery-list/complete";
import { deleteTrip } from "@/app/history/actions";
import { getAnalytics } from "@/app/history/data";

const TAG = `ITEST-DELTRIP-${Date.now()}`;
const WEEK = new Date("2027-05-03");
let itemId = "";
let listId = "";
let snapshotId = "";
let mealPlanId = "";
let recipeId = "";

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.append(k, v);
  return f;
}

afterAll(async () => {
  if (snapshotId) await prisma.tripSnapshot.deleteMany({ where: { id: snapshotId } });
  if (listId) await prisma.shoppingList.deleteMany({ where: { id: listId } });
  if (mealPlanId) await prisma.mealPlan.deleteMany({ where: { id: mealPlanId } });
  if (recipeId) await prisma.recipe.deleteMany({ where: { id: recipeId } });
  if (itemId) {
    await prisma.priceObservation.deleteMany({ where: { itemId } });
    await prisma.item.deleteMany({ where: { id: itemId } });
  }
  await prisma.$disconnect();
});

describe("deleteTrip removes a completed trip and frees its week", () => {
  it("deletes the snapshot, list, and price observations, and reverts the meal plan to draft", async () => {
    const household = await getDefaultHousehold();
    const store = await getDefaultStore();

    const item = await prisma.item.create({
      data: { canonicalName: `${TAG} Eggs`, purchaseUnit: "dozen", aldiFriendly: true },
    });
    itemId = item.id;

    // A completed-status meal plan for the week (completeTrip marks the week's plans completed;
    // here we seed it directly to prove the revert).
    const recipe = await prisma.recipe.create({
      data: { householdId: household.id, title: `${TAG} Omelets`, baseServings: 4 },
    });
    recipeId = recipe.id;
    const plan = await prisma.mealPlan.create({
      data: { householdId: household.id, weekStartDate: WEEK, status: "completed" },
    });
    mealPlanId = plan.id;

    // Active list with one checked, priced item sourced from the recipe (so the frozen snapshot
    // carries the recipe title, which drives "most-selected meals").
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
              displayName: `${TAG} Eggs`,
              quantity: 1,
              unit: "dozen",
              checked: true,
              estimatedPrice: 3.5,
              paidPrice: 3.25,
              sourceSummary: recipe.title,
              sources: {
                create: [{ sourceType: "recipe", recipeId: recipe.id, quantity: 1, unit: "dozen" }],
              },
            },
          ],
        },
      },
    });
    listId = list.id;

    snapshotId = await completeTrip(list.id);

    // Sanity: completion wrote a snapshot + two observations (estimated + paid).
    const obsBefore = await prisma.priceObservation.findMany({ where: { itemId: item.id } });
    expect(obsBefore.length).toBe(2);

    // The meal now appears in trip-derived analytics.
    const before = await getAnalytics();
    expect(before.meals.some((m) => m.title === recipe.title)).toBe(true);

    await expect(deleteTrip(fd({ snapshotId }))).rejects.toThrow("REDIRECT:/history?deleted=1");

    expect(await prisma.tripSnapshot.findUnique({ where: { id: snapshotId } })).toBeNull();
    expect(await prisma.tripSnapshotItem.count({ where: { tripSnapshotId: snapshotId } })).toBe(0);
    expect(await prisma.shoppingList.findUnique({ where: { id: list.id } })).toBeNull();
    expect(await prisma.priceObservation.count({ where: { itemId: item.id } })).toBe(0);

    const revertedPlan = await prisma.mealPlan.findUnique({ where: { id: plan.id } });
    expect(revertedPlan!.status).toBe("draft");

    // The meal is gone from analytics once its trip is deleted (the reported bug).
    const after = await getAnalytics();
    expect(after.meals.some((m) => m.title === recipe.title)).toBe(false);
  });
});
