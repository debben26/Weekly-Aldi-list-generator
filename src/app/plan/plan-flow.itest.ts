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
  saveStapleSelections,
  addStapleItem,
  saveRestockSelections,
  addRestockManualItem,
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

    // A weekly staple rule for later tests. Staples are opt-in now — generation must NOT add
    // them; they only land on the list via saveStapleSelections on the Staples step.
    const produce = await prisma.storeSection.findFirst({ where: { storeId: store.id, name: "Produce" } });
    const wkItem = await prisma.item.create({
      data: { canonicalName: `${TAG} Milk`, purchaseUnit: "gallon", aldiFriendly: true },
    });
    weeklyItemId = wkItem.id;
    itemIds.push(wkItem.id);
    const wkRule = await prisma.stapleRule.create({
      data: { householdId: household.id, itemId: wkItem.id, ruleType: "weekly", defaultQuantity: 1, defaultUnit: "gallon", defaultSectionId: produce!.id },
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
    expect(sourceTypes.has("weekly_staple")).toBe(false);
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
    // saveStapleSelections resolves the household via the plan, so it needs a real one.
    const plan = await prisma.mealPlan.create({
      data: { householdId: household.id, weekStartDate: new Date("2027-03-01"), status: "draft" },
    });
    planIds.push(plan.id);
    const planId = plan.id;

    // Weekly staple checked then unchecked via the batch save. The action redirects to the
    // Restock step on success (the mocked redirect throws).
    await expect(
      saveStapleSelections(fd({ planId, listId: list.id, ruleIds: weeklyRuleId })),
    ).rejects.toThrow(`REDIRECT:/plan/${planId}/restock`);
    const stapleRow = await prisma.shoppingListItem.findFirst({
      where: { shoppingListId: list.id, itemId: weeklyItemId },
      include: { sources: true },
    });
    expect(stapleRow).not.toBeNull();
    expect(stapleRow!.sources.some((s) => s.sourceType === "weekly_staple")).toBe(true);
    // The rule's pinned section carries through to the saved row.
    const produce = await prisma.storeSection.findFirst({ where: { storeId: store.id, name: "Produce" } });
    expect(stapleRow!.sectionId).toBe(produce!.id);

    await expect(
      saveStapleSelections(fd({ planId, listId: list.id })),
    ).rejects.toThrow(`REDIRECT:/plan/${planId}/restock`);
    expect(await prisma.shoppingListItem.findFirst({ where: { shoppingListId: list.id, itemId: weeklyItemId } })).toBeNull();

    // A row that ALSO came from a recipe must survive a staple uncheck: only the staple
    // source/label is stripped, the recipe provenance (and the row) stay.
    const dualRow = await prisma.shoppingListItem.create({
      data: {
        shoppingListId: list.id,
        itemId: weeklyItemId,
        displayName: `${TAG} Milk`,
        quantity: 1,
        unit: "gallon",
        sourceSummary: "Tacos + Weekly Staples",
        sources: {
          create: [
            { sourceType: "recipe", quantity: 1, unit: "cup" },
            { sourceType: "weekly_staple", quantity: 1, unit: "gallon" },
          ],
        },
      },
    });
    await expect(
      saveStapleSelections(fd({ planId, listId: list.id })),
    ).rejects.toThrow(`REDIRECT:/plan/${planId}/restock`);
    const survivor = await prisma.shoppingListItem.findUnique({
      where: { id: dualRow.id },
      include: { sources: true },
    });
    expect(survivor).not.toBeNull();
    expect(survivor!.sources.map((s) => s.sourceType)).toEqual(["recipe"]);
    expect(survivor!.sourceSummary).toBe("Tacos");
    await prisma.shoppingListItem.delete({ where: { id: dualRow.id } });

    // Restock checked adds restock provenance; unchecked removes the restock-only row. The
    // batch save redirects to the Final List step on success.
    await expect(
      saveRestockSelections(fd({ planId, listId: list.id, ruleIds: restockRuleId })),
    ).rejects.toThrow(`REDIRECT:/plan/${planId}/final`);
    const row = await prisma.shoppingListItem.findFirst({
      where: { shoppingListId: list.id, itemId: restockItemId },
      include: { sources: true },
    });
    expect(row!.sources.some((s) => s.sourceType === "restock")).toBe(true);
    await expect(
      saveRestockSelections(fd({ planId, listId: list.id })),
    ).rejects.toThrow(`REDIRECT:/plan/${planId}/final`);
    expect(await prisma.shoppingListItem.findFirst({ where: { shoppingListId: list.id, itemId: restockItemId } })).toBeNull();

    const manualPick = await prisma.item.create({
      data: {
        canonicalName: `${TAG} Manual Pick`,
        purchaseUnit: "bag",
        defaultSectionId: produce!.id,
        aldiFriendly: true,
      },
    });
    itemIds.push(manualPick.id);

    await addStapleItem(fd({ planId, listId: list.id, itemId: manualPick.id, quantity: "2" }));
    const pickedRow = await prisma.shoppingListItem.findFirst({
      where: { shoppingListId: list.id, itemId: manualPick.id },
      include: { sources: true },
    });
    expect(pickedRow).not.toBeNull();
    expect(pickedRow!.displayName).toBe(manualPick.canonicalName);
    expect(pickedRow!.unit).toBe("bag");
    expect(pickedRow!.sectionId).toBe(produce!.id);
    expect(pickedRow!.sources).toEqual([
      expect.objectContaining({ sourceType: "manual", quantity: 2, unit: "bag" }),
    ]);

    const newManualName = `${TAG} Manual New`;
    await addRestockManualItem(fd({ planId, listId: list.id, newItemName: newManualName, quantity: "1", unit: "pack" }));
    const newManualItem = await prisma.item.findUnique({ where: { canonicalName: newManualName } });
    expect(newManualItem).not.toBeNull();
    itemIds.push(newManualItem!.id);
    const newRow = await prisma.shoppingListItem.findFirst({
      where: { shoppingListId: list.id, itemId: newManualItem!.id },
      include: { sources: true },
    });
    expect(newRow).not.toBeNull();
    expect(newRow!.displayName).toBe(newManualName);
    expect(newRow!.unit).toBe("pack");
    expect(newRow!.sources.some((s) => s.sourceType === "manual")).toBe(true);
  });
});
