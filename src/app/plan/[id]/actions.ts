"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import { getRankedSuggestions } from "@/app/meal-plan/data";
import { generateFromMealPlan } from "@/app/grocery-list/generate";
import { addRestock } from "@/app/grocery-list/restock";
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

// Submit the package: require >=1 meal, build the draft grocery list, advance to staples (§7).
// If a list already exists for the week, confirm before rebuilding (it would discard manual edits).
export async function useTheseMeals(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const confirmedRebuild = String(formData.get("rebuild") ?? "") === "true";

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    select: { householdId: true, weekStartDate: true, _count: { select: { entries: true } } },
  });
  if (!plan) redirect("/plan");
  if (plan!._count.entries === 0) {
    redirect(
      `${mealsPath(planId)}?error=${encodeURIComponent("Choose at least one meal before continuing.")}`,
    );
  }

  const store = await getDefaultStore();
  const existingList = await prisma.shoppingList.findFirst({
    where: {
      householdId: plan!.householdId,
      storeId: store.id,
      weekStart: plan!.weekStartDate,
      status: { not: "completed" },
    },
    select: { id: true },
  });
  if (existingList && !confirmedRebuild) {
    redirect(`${mealsPath(planId)}?prompt=rebuild`);
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

// Re-add a weekly staple to the draft list after it was excluded. No-op if already present.
export async function includeStaple(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");

  const rule = await prisma.stapleRule.findUnique({ where: { id: ruleId }, include: { item: true } });
  if (!rule) return;

  const existing = await prisma.shoppingListItem.findFirst({
    where: { shoppingListId: listId, itemId: rule.itemId },
  });
  if (!existing) {
    const unit = rule.defaultUnit ?? rule.item.purchaseUnit;
    await prisma.shoppingListItem.create({
      data: {
        shoppingListId: listId,
        itemId: rule.itemId,
        displayName: rule.item.canonicalName,
        quantity: rule.defaultQuantity,
        unit,
        sectionId: rule.defaultSectionId ?? rule.item.defaultSectionId,
        sourceSummary: "Weekly Staples",
        sources: { create: [{ sourceType: "weekly_staple", quantity: rule.defaultQuantity, unit }] },
      },
    });
  }
  revalidatePath(`/plan/${planId}/staples`);
}

// Exclude a weekly staple from this week's list (delete the row). Phase 1 keeps this simple — a
// staple item that also came from a recipe is uncommon; full-row delete is acceptable.
export async function excludeStaple(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  await prisma.shoppingListItem.deleteMany({ where: { shoppingListId: listId, itemId } });
  revalidatePath(`/plan/${planId}/staples`);
}

// ---------- Restock step ----------

// Include a restock suggestion in the draft list (reuses the provenance-correct restock add).
export async function includeRestock(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");
  await addRestock(listId, ruleId);
  revalidatePath(`/plan/${planId}/restock`);
}

// Remove restock provenance from an item. If the item has no other source, drop the row; otherwise
// keep the row (it's still needed for a recipe/staple) and just strip the restock source/label.
export async function excludeRestock(formData: FormData) {
  const planId = String(formData.get("planId") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");

  const row = await prisma.shoppingListItem.findFirst({
    where: { shoppingListId: listId, itemId },
    include: { sources: true },
  });
  if (row) {
    const others = row.sources.filter((s) => s.sourceType !== "restock");
    if (others.length === 0) {
      await prisma.shoppingListItem.delete({ where: { id: row.id } });
    } else {
      await prisma.shoppingListItemSource.deleteMany({
        where: { shoppingListItemId: row.id, sourceType: "restock" },
      });
      const labels = (row.sourceSummary ?? "").split(" + ").filter((l) => l && l !== "Restock");
      await prisma.shoppingListItem.update({
        where: { id: row.id },
        data: { sourceSummary: labels.join(" + ") || null },
      });
    }
  }
  revalidatePath(`/plan/${planId}/restock`);
}
