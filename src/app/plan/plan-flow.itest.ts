import { describe, it, expect, afterAll, vi } from "vitest";

// The wizard actions call request-scoped Next helpers; stub them so we can drive the DB logic.
// redirect() never returns in real code, so the mock throws a tagged error we can assert on.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));

import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import {
  generatePackage,
  removeMeal,
  swapMeal,
  useTheseMeals,
  includeStaple,
  excludeStaple,
  includeRestock,
  excludeRestock,
} from "@/app/plan/[id]/actions";

const TAG = `ITEST-PLAN-${Date.now()}`;
const recipeIds: string[] = [];
const itemIds: string[] = [];
const planIds: string[] = [];
const listIds: string[] = [];
let weeklyItemId = "";
let restockItemId = "";
let weeklyRuleId = "";
let restockRuleId = "";

function fd(values: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(values)) f.append(k, v);
  return f;
}

afterAll(async () => {
  for (const id of planIds) await prisma.mealPlan.deleteMany({ where: { id } }); // cascades entries
  for (const id of listIds) await prisma.shoppingList.deleteMany({ where: { id } }); // cascades items
  await prisma.stapleRule.deleteMany({ where: { id: { in: [weeklyRuleId, restockRuleId].filter(Boolean) } } });
  for (const id of recipeIds) await prisma.recipe.deleteMany({ where: { id } }); // cascades ingredients
  await prisma.item.deleteMany({ where: { id: { in: itemIds } } });
  await prisma.$disconnect();
});

describe("meals-first wizard actions", () => {
  it("generatePackage creates the requested number of entries; remove/swap mutate entries without deleting recipes", async () => {
    const household = await getDefaultHousehold();

    // Two throwaway recipes so the household has at least two rankable meals.
    for (const n of [1, 2]) {
      const r = await prisma.recipe.create({
        data: { householdId: household.id, title: `${TAG} Recipe ${n}`, baseServings: 4 },
      });
      recipeIds.push(r.id);
    }
    const swapTarget = await prisma.recipe.create({
      data: { householdId: household.id, title: `${TAG} Swap Target`, baseServings: 6 },
    });
    recipeIds.push(swapTarget.id);

    const plan = await prisma.mealPlan.create({
      data: { householdId: household.id, weekStartDate: new Date("2027-01-04"), status: "draft" },
    });
    planIds.push(plan.id);

    await generatePackage(fd({ planId: plan.id, count: "2" }));
    let entries = await prisma.mealPlanEntry.findMany({ where: { mealPlanId: plan.id } });
    expect(entries).toHaveLength(2);

    // Remove one meal: entry gone, recipe untouched (spec 6.2).
    const removedRecipeId = entries[0].recipeId;
    await removeMeal(fd({ planId: plan.id, entryId: entries[0].id }));
    entries = await prisma.mealPlanEntry.findMany({ where: { mealPlanId: plan.id } });
    expect(entries).toHaveLength(1);
    expect(await prisma.recipe.findUnique({ where: { id: removedRecipeId } })).not.toBeNull();

    // Swap the remaining meal to a specific recipe; target servings follow the new recipe.
    await swapMeal(fd({ planId: plan.id, entryId: entries[0].id, recipeId: swapTarget.id }));
    const swapped = await prisma.mealPlanEntry.findFirst({ where: { mealPlanId: plan.id } });
    expect(swapped!.recipeId).toBe(swapTarget.id);
    expect(swapped!.targetServings).toBe(6);
  });

  it("useTheseMeals blocks an empty package and otherwise builds the list and advances to staples", async () => {
    const household = await getDefaultHousehold();
    const store = await getDefaultStore();

    // A weekly staple so the generated list carries a non-recipe source too.
    const wkItem = await prisma.item.create({
      data: { canonicalName: `${TAG} Milk`, purchaseUnit: "gallon", aldiFriendly: true },
    });
    weeklyItemId = wkItem.id;
    itemIds.push(wkItem.id);
    const wkRule = await prisma.stapleRule.create({
      data: { householdId: household.id, itemId: wkItem.id, ruleType: "weekly", defaultQuantity: 1, defaultUnit: "gallon" },
    });
    weeklyRuleId = wkRule.id;

    const plan = await prisma.mealPlan.create({
      data: { householdId: household.id, weekStartDate: new Date("2027-02-01"), status: "draft" },
    });
    planIds.push(plan.id);

    // Empty package is rejected.
    await expect(useTheseMeals(fd({ planId: plan.id }))).rejects.toThrow(/error=/);

    // Recipe with an ingredient so it contributes a row.
    const recipe = await prisma.recipe.create({
      data: {
        householdId: household.id,
        title: `${TAG} Tacos`,
        baseServings: 4,
        ingredients: { create: [{ rawText: "chicken breast", itemId: wkItem.id, quantity: 1, recipeUnit: "lb" }] },
      },
    });
    recipeIds.push(recipe.id);
    await prisma.mealPlanEntry.create({ data: { mealPlanId: plan.id, recipeId: recipe.id, targetServings: 4 } });

    await expect(useTheseMeals(fd({ planId: plan.id }))).rejects.toThrow(`REDIRECT:/plan/${plan.id}/staples`);

    const list = await prisma.shoppingList.findFirst({
      where: { householdId: household.id, storeId: store.id, weekStart: plan.weekStartDate },
      include: { items: { include: { sources: true } } },
    });
    expect(list).not.toBeNull();
    listIds.push(list!.id);
    const sourceTypes = new Set(list!.items.flatMap((i) => i.sources.map((s) => s.sourceType)));
    expect(sourceTypes.has("recipe")).toBe(true);
    expect(sourceTypes.has("weekly_staple")).toBe(true);
  });

  it("staple and restock include/exclude mutate the draft list correctly", async () => {
    const household = await getDefaultHousehold();
    const store = await getDefaultStore();

    const rsItem = await prisma.item.create({
      data: { canonicalName: `${TAG} Olive Oil`, purchaseUnit: "bottle", aldiFriendly: true },
    });
    restockItemId = rsItem.id;
    itemIds.push(rsItem.id);
    const rsRule = await prisma.stapleRule.create({
      data: { householdId: household.id, itemId: rsItem.id, ruleType: "restock", defaultQuantity: 1, defaultUnit: "bottle", expectedIntervalDays: 60 },
    });
    restockRuleId = rsRule.id;

    const list = await prisma.shoppingList.create({
      data: { householdId: household.id, storeId: store.id, weekStart: new Date("2027-03-01"), status: "active" },
    });
    listIds.push(list.id);
    const planId = "noop-plan-id"; // only used for the mocked revalidatePath

    // Weekly staple include then exclude.
    await includeStaple(fd({ planId, listId: list.id, ruleId: weeklyRuleId }));
    expect(await prisma.shoppingListItem.findFirst({ where: { shoppingListId: list.id, itemId: weeklyItemId } })).not.toBeNull();
    await excludeStaple(fd({ planId, listId: list.id, itemId: weeklyItemId }));
    expect(await prisma.shoppingListItem.findFirst({ where: { shoppingListId: list.id, itemId: weeklyItemId } })).toBeNull();

    // Restock include adds restock provenance; exclude removes the restock-only row.
    await includeRestock(fd({ planId, listId: list.id, ruleId: restockRuleId }));
    const row = await prisma.shoppingListItem.findFirst({
      where: { shoppingListId: list.id, itemId: restockItemId },
      include: { sources: true },
    });
    expect(row!.sources.some((s) => s.sourceType === "restock")).toBe(true);
    await excludeRestock(fd({ planId, listId: list.id, itemId: restockItemId }));
    expect(await prisma.shoppingListItem.findFirst({ where: { shoppingListId: list.id, itemId: restockItemId } })).toBeNull();
  });
});
