// MealSuggestionService — derived Aldi fit (8.4) and deterministic saved-recipe ranking (8.3).
// Pure functions, no DB/LLM. Aldi fit lives here because it is recipe-quality logic that also
// feeds the meal-suggestion score.

import {
  ALDI_FIT_GOOD_MIN,
  ALDI_FIT_MEDIUM_MIN,
  ALDI_FIT_MIN_MAPPED_FRACTION,
  MEAL_WEIGHT_FAVORITE,
  MEAL_ALDI_FIT_SCORE,
  MEAL_RECENCY_PENALTY_MAX,
  MEAL_RECENCY_WINDOW_DAYS,
  MEAL_WEIGHT_PANTRY_OVERLAP,
  MEAL_COST_REFERENCE,
  MEAL_WEIGHT_COST,
} from "@/lib/constants";

export type AldiFitStatus = "good" | "medium" | "low" | "unknown";

/**
 * Derive a recipe's Aldi fit from its mapped ingredients (spec 8.4):
 * fit = (# aldi_friendly mapped items) / (# mapped items).
 * If too few ingredients are mapped to judge (< 50% mapped, or none), -> unknown.
 */
export function computeAldiFit(
  ingredients: { itemId: string | null; aldiFriendly: boolean | null }[],
): AldiFitStatus {
  const total = ingredients.length;
  if (total === 0) return "unknown";

  const mapped = ingredients.filter((i) => i.itemId != null);
  if (mapped.length / total < ALDI_FIT_MIN_MAPPED_FRACTION) return "unknown";

  const aldiCount = mapped.filter((i) => i.aldiFriendly === true).length;
  const fit = aldiCount / mapped.length;

  if (fit >= ALDI_FIT_GOOD_MIN) return "good";
  if (fit >= ALDI_FIT_MEDIUM_MIN) return "medium";
  return "low";
}

export type RecipeScoreInput = {
  recipeId: string;
  title: string;
  favorite: boolean;
  aldiFitStatus: AldiFitStatus;
  /** Days since the recipe was last used; null = never used. */
  daysSinceLastUsed: number | null;
  /** Count of this recipe's ingredients currently on hand in the pantry. */
  pantryOverlapCount: number;
  /** Estimated cost if known; null when no pricing yet (M6). */
  estimatedCost: number | null;
};

// Recency penalty (spec 8.3): a just-used recipe is penalized most; the penalty fades linearly
// to 0 across the recency window. Never-used recipes get no penalty.
function recencyPenalty(daysSinceLastUsed: number | null): number {
  if (daysSinceLastUsed == null) return 0;
  if (daysSinceLastUsed >= MEAL_RECENCY_WINDOW_DAYS) return 0;
  const remaining = (MEAL_RECENCY_WINDOW_DAYS - daysSinceLastUsed) / MEAL_RECENCY_WINDOW_DAYS;
  return MEAL_RECENCY_PENALTY_MAX * remaining;
}

function costBoost(estimatedCost: number | null): number {
  if (estimatedCost == null) return 0; // no pricing -> neutral
  const cheaper = (MEAL_COST_REFERENCE - estimatedCost) / MEAL_COST_REFERENCE;
  // clamp to [-1, 1] so an outlier cost can't dominate the ranking
  const clamped = Math.max(-1, Math.min(1, cheaper));
  return MEAL_WEIGHT_COST * clamped;
}

/** Deterministic score (spec 8.3). Higher is a better suggestion. */
export function scoreRecipe(input: RecipeScoreInput): number {
  return (
    (input.favorite ? MEAL_WEIGHT_FAVORITE : 0) +
    (MEAL_ALDI_FIT_SCORE[input.aldiFitStatus] ?? 0) +
    MEAL_WEIGHT_PANTRY_OVERLAP * input.pantryOverlapCount +
    costBoost(input.estimatedCost) -
    recencyPenalty(input.daysSinceLastUsed)
  );
}

/** Rank saved recipes by score (desc), tie-broken by title then id for stable output. */
export function rankRecipes(
  inputs: RecipeScoreInput[],
): { input: RecipeScoreInput; score: number }[] {
  return inputs
    .map((input) => ({ input, score: scoreRecipe(input) }))
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const byTitle = a.input.title.localeCompare(b.input.title);
      if (byTitle !== 0) return byTitle;
      return a.input.recipeId.localeCompare(b.input.recipeId);
    });
}
