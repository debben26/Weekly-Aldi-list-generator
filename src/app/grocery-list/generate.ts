import { prisma } from "@/lib/prisma";
import { getDefaultStore } from "@/lib/context";
import { OTHER_SECTION_NAME } from "@/lib/constants";
import {
  scaleIngredientQuantity,
  isSuppressedByPantry,
  resolveSectionId,
} from "@/services/GroceryListGenerationService";
import {
  normalizeText,
  mergeContributions,
  type MergeContribution,
  type MergeItemInfo,
} from "@/services/ItemMergeService";

// Orchestrates spec 8.1: assemble contributions from active weekly staples + the meal plan's
// scaled recipe ingredients, suppress pantry `have` items (unless overridden), resolve free text
// to item_id via aliases (8.1b), merge (8.1a), then persist the ShoppingList with full source
// provenance. Returns the new ShoppingList id. Regenerating replaces any existing active list
// for that week; a completed trip blocks regeneration to prevent duplicate history snapshots.
export async function generateFromMealPlan(
  mealPlanId: string,
  overriddenItemIds: Set<string> = new Set(),
): Promise<string> {
  const store = await getDefaultStore();

  const plan = await prisma.mealPlan.findUnique({
    where: { id: mealPlanId },
    include: {
      entries: { include: { recipe: { include: { ingredients: { include: { item: true } } } } } },
    },
  });
  if (!plan) throw new Error("Meal plan not found");

  const [staples, pantry, catalog, otherSection] = await Promise.all([
    prisma.stapleRule.findMany({
      where: { householdId: plan.householdId, ruleType: "weekly", active: true },
      include: { item: true },
    }),
    prisma.pantryItem.findMany({ where: { householdId: plan.householdId } }),
    prisma.item.findMany({ where: { active: true }, include: { aliases: true } }),
    prisma.storeSection.findFirst({ where: { storeId: store.id, name: OTHER_SECTION_NAME } }),
  ]);

  // Lookups: resolve free text -> item_id (8.1b), item info for aggregation, default section.
  const resolveByText = new Map<string, string>();
  const itemInfoById = new Map<string, MergeItemInfo>();
  const sectionByItem = new Map<string, string | null>();
  for (const it of catalog) {
    resolveByText.set(normalizeText(it.canonicalName), it.id);
    for (const a of it.aliases) resolveByText.set(a.aliasText, it.id);
    itemInfoById.set(it.id, {
      canonicalName: it.canonicalName,
      purchaseUnit: it.purchaseUnit,
      recipeToPurchase: (it.recipeToPurchase as Record<string, number> | null) ?? null,
    });
    sectionByItem.set(it.id, it.defaultSectionId);
  }

  const pantryHave = new Set(
    pantry.filter((p) => p.status === "have").map((p) => p.itemId),
  );

  const contributions: MergeContribution[] = [];

  // 2. Active weekly staples
  for (const s of staples) {
    contributions.push({
      itemId: s.itemId,
      displayName: s.item.canonicalName,
      normalizedName: normalizeText(s.item.canonicalName),
      quantity: s.defaultQuantity,
      unit: s.defaultUnit ?? s.item.purchaseUnit,
      rawText: null,
      source: { type: "weekly_staple", label: "Weekly Staples", recipeId: null },
    });
  }

  // 3. Scaled meal-plan recipe ingredients
  for (const entry of plan.entries) {
    for (const ing of entry.recipe.ingredients) {
      const qty = scaleIngredientQuantity(
        ing.quantity,
        ing.scalable,
        entry.recipe.baseServings,
        entry.targetServings,
      );
      const displayName = ing.item?.canonicalName ?? ing.rawText;
      // 7. Resolve free text to an item_id via canonical/alias match when unmapped.
      let itemId = ing.itemId;
      if (!itemId) itemId = resolveByText.get(normalizeText(ing.rawText)) ?? null;
      contributions.push({
        itemId,
        displayName,
        normalizedName: normalizeText(displayName),
        quantity: qty,
        unit: ing.recipeUnit,
        rawText: ing.rawText,
        source: { type: "recipe", label: entry.recipe.title, recipeId: entry.recipe.id },
      });
    }
  }

  // 5. Pantry exclusion: drop contributions for items marked `have` unless the user overrides.
  const kept = contributions.filter(
    (c) =>
      !(
        c.itemId &&
        isSuppressedByPantry(pantryHave.has(c.itemId) ? "have" : null, overriddenItemIds.has(c.itemId))
      ),
  );

  // 8. Merge
  const rows = mergeContributions(kept, itemInfoById);

  // Guard: do not overwrite a completed trip — that would orphan the existing snapshot link
  // and risk creating a duplicate history entry for the same week.
  const completedList = await prisma.shoppingList.findFirst({
    where: {
      householdId: plan.householdId,
      storeId: store.id,
      weekStart: plan.weekStartDate,
      status: "completed",
    },
  });
  if (completedList) {
    throw new Error(
      "A completed trip already exists for this week. Complete a new week to generate a fresh list.",
    );
  }

  // Replace any existing (non-completed) list for this household/store/week, then persist fresh.
  await prisma.shoppingList.deleteMany({
    where: { householdId: plan.householdId, storeId: store.id, weekStart: plan.weekStartDate },
  });
  const list = await prisma.shoppingList.create({
    data: {
      householdId: plan.householdId,
      storeId: store.id,
      weekStart: plan.weekStartDate,
      status: "active",
    },
  });

  for (const row of rows) {
    // 10. Section: item default -> Other / Unassigned.
    const sectionId = resolveSectionId(row.itemId, sectionByItem, otherSection?.id ?? null);
    await prisma.shoppingListItem.create({
      data: {
        shoppingListId: list.id,
        itemId: row.itemId,
        displayName: row.displayName,
        quantity: row.quantity,
        unit: row.unit,
        sectionId,
        sourceSummary: row.sourceSummary,
        sources: {
          create: row.sources.map((s) => ({
            sourceType: s.type,
            recipeId: s.recipeId,
            quantity: s.quantity,
            unit: s.unit,
          })),
        },
      },
    });
  }

  return list.id;
}
