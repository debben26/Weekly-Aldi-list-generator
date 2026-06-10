"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { getRankedSuggestions } from "@/app/meal-plan/data";
import { generateFromMealPlan } from "@/app/grocery-list/generate";
import { clampMealCount, selectPackage, pickReplacement } from "@/services/MealPackageService";

function mealsPath(planId: string) {
  return `/plan/${planId}/meals`;
}

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

type BatchListItemRow = {
  id: string;
  shoppingListId: string;
  itemId: string;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  sectionId: string | null;
  sourceSummary: string;
};

type BatchListItemSourceRow = {
  shoppingListItemId: string;
  sourceType: "weekly_staple" | "restock";
  quantity: number | null;
  unit: string | null;
};

// Generate the initial meal package: fill the plan up to `count` entries from ranked saved recipes,
// skipping recipes already in the plan. Under-supply (fewer saved recipes than requested) is not an
// error — we add what we can and surface a notice (spec §15.1).
export async function generatePackage(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const count = clampMealCount(num(formData.get("count")) ?? NaN);
  const household = await getDefaultHousehold();

  const existing = await prisma.mealPlanEntry.findMany({
    where: { mealPlanId: planId },
    select: { recipeId: true },
  });
  const excludeIds = existing.map((e) => e.recipeId);
  const need = Math.max(0, count - existing.length);

  const ranked = await getRankedSuggestions(household.id, planId);
  const picked = selectPackage(ranked, need, excludeIds);

  if (picked.length > 0) {
    const recipes = await prisma.recipe.findMany({
      where: { id: { in: picked } },
      select: { id: true, baseServings: true },
    });
    const servingsById = new Map(recipes.map((r) => [r.id, r.baseServings]));
    await prisma.mealPlanEntry.createMany({
      data: picked.map((recipeId) => ({
        mealPlanId: planId,
        recipeId,
        targetServings: servingsById.get(recipeId) ?? 4,
      })),
    });
  }

  if (picked.length < need) {
    const total = existing.length + picked.length;
    const notice =
      total === 0
        ? "You have no saved meals yet. Add recipes first, or continue with manual items."
        : `You only have ${total} saved meal${total === 1 ? "" : "s"} available — we added ${
            total === 1 ? "it" : "those"
          }.`;
    redirect(`${mealsPath(planId)}?notice=${encodeURIComponent(notice)}`);
  }

  revalidatePath(mealsPath(planId));
}

// Remove a meal from the package. Deletes only the plan entry — never the underlying recipe (§6.2).
export async function removeMeal(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  await prisma.mealPlanEntry.delete({ where: { id: entryId } });
  revalidatePath(mealsPath(planId));
}

// Replace one meal with a fresh ranked suggestion, avoiding every recipe already in the package
// (including the one being replaced, so it doesn't immediately repeat — §6.3).
export async function regenerateMeal(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const household = await getDefaultHousehold();

  const entries = await prisma.mealPlanEntry.findMany({
    where: { mealPlanId: planId },
    select: { recipeId: true },
  });
  const ranked = await getRankedSuggestions(household.id, planId);
  const replacementId = pickReplacement(ranked, entries.map((e) => e.recipeId));

  if (!replacementId) {
    redirect(
      `${mealsPath(planId)}?notice=${encodeURIComponent(
        "No other saved meals are available to suggest.",
      )}`,
    );
  }

  const recipe = await prisma.recipe.findUnique({
    where: { id: replacementId! },
    select: { baseServings: true },
  });
  await prisma.mealPlanEntry.update({
    where: { id: entryId },
    data: { recipeId: replacementId!, targetServings: recipe?.baseServings ?? 4 },
  });
  revalidatePath(mealsPath(planId));
}

// Swap a meal for a specific saved recipe the user chose from search (§6.4).
export async function swapMeal(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const entryId = String(formData.get("entryId") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  if (!recipeId) redirect(mealsPath(planId));

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { baseServings: true },
  });
  if (!recipe) redirect(mealsPath(planId));

  await prisma.mealPlanEntry.update({
    where: { id: entryId },
    data: { recipeId, targetServings: recipe!.baseServings },
  });
  revalidatePath(mealsPath(planId));
}

// Add a specific saved recipe to the package from the "Add a meal" browser (§6.4).
export async function addMealToPlan(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  if (!recipeId) redirect(mealsPath(planId));

  const recipe = await prisma.recipe.findUnique({
    where: { id: recipeId },
    select: { baseServings: true },
  });
  if (!recipe) redirect(mealsPath(planId));

  await prisma.mealPlanEntry.create({
    data: { mealPlanId: planId, recipeId, targetServings: recipe!.baseServings },
  });
  revalidatePath(mealsPath(planId));
}

// Submit the package: require >=1 meal, build the draft grocery list, advance to staples (§7).
// An existing list for the week is rebuilt in place (generateFromMealPlan replaces it).
export async function useTheseMeals(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    select: { _count: { select: { entries: true } } },
  });
  if (!plan) redirect("/plan");
  if (plan!._count.entries === 0) {
    redirect(
      `${mealsPath(planId)}?error=${encodeURIComponent("Choose at least one meal before continuing.")}`,
    );
  }

  try {
    await generateFromMealPlan(planId);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not build the grocery list.";
    redirect(`${mealsPath(planId)}?error=${encodeURIComponent(msg)}`);
  }
  redirect(`/plan/${planId}/staples`);
}

// ---------- Weekly Staples step ----------

// Save the staples checklist in one shot: checked rules are added to the draft list (no-op if
// already present), unchecked rules are removed, then the wizard advances to Restock. Staples
// are opt-in — list generation no longer adds them, so a fresh list starts with none checked.
export async function saveStapleSelections(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const checkedRuleIds = new Set(formData.getAll("ruleIds").map(String));

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    select: { householdId: true },
  });
  if (!plan) redirect("/plan");

  const [rules, onList] = await Promise.all([
    prisma.stapleRule.findMany({
      where: { householdId: plan!.householdId, ruleType: "weekly", active: true },
      include: { item: true },
    }),
    prisma.shoppingListItem.findMany({
      where: { shoppingListId: listId, itemId: { not: null } },
      select: { itemId: true },
    }),
  ]);
  const onListItemIds = new Set(onList.map((i) => i.itemId));
  const createRows: BatchListItemRow[] = [];
  const createSourceRows: BatchListItemSourceRow[] = [];
  const deleteItemIds: string[] = [];

  for (const rule of rules) {
    const checked = checkedRuleIds.has(rule.id);
    if (checked && !onListItemIds.has(rule.itemId)) {
      const unit = rule.defaultUnit ?? rule.item.purchaseUnit;
      const id = randomUUID();
      createRows.push({
        id,
        shoppingListId: listId,
        itemId: rule.itemId,
        displayName: rule.item.canonicalName,
        quantity: rule.defaultQuantity,
        unit,
        sectionId: rule.defaultSectionId ?? rule.item.defaultSectionId,
        sourceSummary: "Weekly Staples",
      });
      createSourceRows.push({
        shoppingListItemId: id,
        sourceType: "weekly_staple" as const,
        quantity: rule.defaultQuantity,
        unit,
      });
    } else if (!checked && onListItemIds.has(rule.itemId)) {
      // Full-row delete mirrors the old excludeStaple — a staple item that also came from a
      // recipe is uncommon; Phase 1 keeps this simple.
      deleteItemIds.push(rule.itemId);
    }
  }

  await prisma.$transaction(async (tx) => {
    if (deleteItemIds.length > 0) {
      await tx.shoppingListItem.deleteMany({
        where: { shoppingListId: listId, itemId: { in: deleteItemIds } },
      });
    }
    if (createRows.length > 0) {
      await tx.shoppingListItem.createMany({ data: createRows });
    }
    if (createSourceRows.length > 0) {
      await tx.shoppingListItemSource.createMany({ data: createSourceRows });
    }
  });

  revalidatePath(`/plan/${planId}/staples`);
  redirect(`/plan/${planId}/restock`);
}

// Add a one-off item to this week's list from the Staples step. Not a recurring rule — it lives on
// the draft list only and shows immediately on the step. Revalidates the staples route so it renders.
export async function addStapleItem(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) return;

  const quantity = num(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "").trim() || null;
  await prisma.shoppingListItem.create({
    data: {
      shoppingListId: listId,
      displayName,
      quantity,
      unit,
      sectionId: String(formData.get("sectionId") ?? "") || null,
      sourceSummary: "Manual",
      sources: { create: [{ sourceType: "manual", quantity, unit }] },
    },
  });
  revalidatePath(`/plan/${planId}/staples`);
}

// Remove a one-off item added on the Staples step (delete the row by id).
export async function removeStapleItem(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const id = String(formData.get("id") ?? "");
  await prisma.shoppingListItem.delete({ where: { id } });
  revalidatePath(`/plan/${planId}/staples`);
}

// ---------- Restock step ----------

// Save the restock checklist in one shot: checked rules gain restock provenance on the draft
// list (reusing the provenance-correct add), unchecked rules lose it, then the wizard advances
// to the Final List. Removing provenance drops the row when restock was its only source;
// otherwise the row stays (it's still needed for a recipe/staple) and only the restock
// source/label is stripped. Rows without restock provenance are never touched.
export async function saveRestockSelections(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const checkedRuleIds = new Set(formData.getAll("ruleIds").map(String));

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    select: { householdId: true },
  });
  if (!plan) redirect("/plan");

  const rules = await prisma.stapleRule.findMany({
    where: { householdId: plan!.householdId, ruleType: "restock", active: true },
    include: { item: true },
  });
  const rows = await prisma.shoppingListItem.findMany({
    where: { shoppingListId: listId, itemId: { in: rules.map((r) => r.itemId) } },
    include: { sources: true },
  });
  const rowByItemId = new Map(rows.filter((row) => row.itemId).map((row) => [row.itemId!, row]));

  const createRows: BatchListItemRow[] = [];
  const createSourceRows: BatchListItemSourceRow[] = [];
  const updateRows: { id: string; sourceSummary: string | null }[] = [];
  const deleteRowIds: string[] = [];
  const stripRestockSourceRowIds: string[] = [];

  for (const rule of rules) {
    const row = rowByItemId.get(rule.itemId);
    const hasRestockSource = row?.sources.some((s) => s.sourceType === "restock") ?? false;

    if (checkedRuleIds.has(rule.id)) {
      if (hasRestockSource) continue;
      const unit = rule.defaultUnit ?? rule.item.purchaseUnit;
      if (!row) {
        const id = randomUUID();
        createRows.push({
          id,
          shoppingListId: listId,
          itemId: rule.itemId,
          displayName: rule.item.canonicalName,
          quantity: rule.defaultQuantity,
          unit,
          sectionId: rule.defaultSectionId ?? rule.item.defaultSectionId,
          sourceSummary: "Restock",
        });
        createSourceRows.push({
          shoppingListItemId: id,
          sourceType: "restock" as const,
          quantity: rule.defaultQuantity,
          unit,
        });
      } else {
        const labels = (row.sourceSummary ?? "").split(" + ").filter(Boolean);
        if (!labels.includes("Restock")) labels.push("Restock");
        updateRows.push({ id: row.id, sourceSummary: labels.join(" + ") });
        createSourceRows.push({
          shoppingListItemId: row.id,
          sourceType: "restock" as const,
          quantity: rule.defaultQuantity,
          unit,
        });
      }
      continue;
    }

    if (!row || !hasRestockSource) continue;
    const others = row.sources.filter((s) => s.sourceType !== "restock");
    if (others.length === 0) {
      deleteRowIds.push(row.id);
    } else {
      stripRestockSourceRowIds.push(row.id);
      const labels = (row.sourceSummary ?? "").split(" + ").filter((l) => l && l !== "Restock");
      updateRows.push({ id: row.id, sourceSummary: labels.join(" + ") || null });
    }
  }

  await prisma.$transaction(async (tx) => {
    if (deleteRowIds.length > 0) {
      await tx.shoppingListItem.deleteMany({ where: { id: { in: deleteRowIds } } });
    }
    if (stripRestockSourceRowIds.length > 0) {
      await tx.shoppingListItemSource.deleteMany({
        where: { shoppingListItemId: { in: stripRestockSourceRowIds }, sourceType: "restock" },
      });
    }
    if (createRows.length > 0) {
      await tx.shoppingListItem.createMany({ data: createRows });
    }
    if (createSourceRows.length > 0) {
      await tx.shoppingListItemSource.createMany({ data: createSourceRows });
    }
    for (const row of updateRows) {
      await tx.shoppingListItem.update({
        where: { id: row.id },
        data: { sourceSummary: row.sourceSummary },
      });
    }
  });

  revalidatePath(`/plan/${planId}/restock`);
  redirect(`/plan/${planId}/final`);
}
