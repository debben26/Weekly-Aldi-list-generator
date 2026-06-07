import { prisma } from "@/lib/prisma";
import {
  rankRecipes,
  type RecipeScoreInput,
  type AldiFitStatus,
} from "@/services/MealSuggestionService";

const MS_PER_DAY = 86_400_000;

// Build deterministic ranked suggestions from saved household recipes (spec 8.3).
export async function getRankedSuggestions(
  householdId: string,
  excludePlanId: string | null,
  today = new Date(),
) {
  const [recipes, pantry, entries] = await Promise.all([
    prisma.recipe.findMany({
      where: { householdId },
      include: { ingredients: { select: { itemId: true } } },
    }),
    prisma.pantryItem.findMany({
      where: { householdId, status: "have" },
      select: { itemId: true },
    }),
    prisma.mealPlanEntry.findMany({
      where: { mealPlan: { householdId } },
      select: { recipeId: true, mealPlanId: true, mealPlan: { select: { weekStartDate: true } } },
    }),
  ]);

  const onHand = new Set(pantry.map((p) => p.itemId));

  // Most recent prior use per recipe (excluding the plan we're building).
  const lastUsed = new Map<string, Date>();
  for (const e of entries) {
    if (e.mealPlanId === excludePlanId) continue;
    const prev = lastUsed.get(e.recipeId);
    if (!prev || e.mealPlan.weekStartDate > prev) lastUsed.set(e.recipeId, e.mealPlan.weekStartDate);
  }

  const inputs: RecipeScoreInput[] = recipes.map((r) => {
    const used = lastUsed.get(r.id);
    const pantryOverlapCount = r.ingredients.filter(
      (i) => i.itemId && onHand.has(i.itemId),
    ).length;
    return {
      recipeId: r.id,
      title: r.title,
      favorite: r.favorite,
      aldiFitStatus: r.aldiFitStatus as AldiFitStatus,
      daysSinceLastUsed: used ? Math.floor((today.getTime() - used.getTime()) / MS_PER_DAY) : null,
      pantryOverlapCount,
      estimatedCost: null, // pricing arrives in M6
    };
  });

  return rankRecipes(inputs);
}
