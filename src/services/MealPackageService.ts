// MealPackageService — pure selection helpers for the meals-first planning wizard.
// No DB/LLM: takes an already-ranked recipe list (from getRankedSuggestions) and decides which
// recipes go into a package. Kept pure so the selection rules are unit-testable.

export const MEAL_COUNT_MIN = 1;
export const MEAL_COUNT_MAX = 14;
export const MEAL_COUNT_DEFAULT = 4;

/** Element shape we need from a ranked suggestion: just the recipe id. */
export type Rankable = { input: { recipeId: string } };

/** Clamp a requested meal count into the supported range; non-numbers fall back to the default. */
export function clampMealCount(n: number): number {
  if (!Number.isFinite(n)) return MEAL_COUNT_DEFAULT;
  return Math.max(MEAL_COUNT_MIN, Math.min(MEAL_COUNT_MAX, Math.floor(n)));
}

/**
 * Pick the top `count` recipe ids from a ranked list, skipping any in `excludeIds`.
 * Returns fewer than `count` when the database can't supply enough (spec §15.1) — the caller
 * surfaces an under-supply notice.
 */
export function selectPackage(
  ranked: Rankable[],
  count: number,
  excludeIds: Iterable<string> = [],
): string[] {
  const exclude = new Set(excludeIds);
  const picked: string[] = [];
  for (const r of ranked) {
    if (picked.length >= count) break;
    if (exclude.has(r.input.recipeId)) continue;
    picked.push(r.input.recipeId);
  }
  return picked;
}

/**
 * Pick a single replacement recipe (the highest-ranked not already excluded), or null when no
 * fresh option exists. Used by "Give me new suggestion" (spec §6.3).
 */
export function pickReplacement(
  ranked: Rankable[],
  excludeIds: Iterable<string> = [],
): string | null {
  const exclude = new Set(excludeIds);
  for (const r of ranked) {
    if (!exclude.has(r.input.recipeId)) return r.input.recipeId;
  }
  return null;
}

/** Case-insensitive name search over saved recipes (spec §6.4, Phase 1 = name only). */
export function searchRecipesByName<T extends { title: string }>(
  recipes: T[],
  query: string,
): T[] {
  const q = query.trim().toLowerCase();
  if (q === "") return recipes;
  return recipes.filter((r) => r.title.toLowerCase().includes(q));
}
