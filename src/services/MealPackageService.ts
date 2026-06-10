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

/** Sort keys mirror the Recipes tab toolbar. */
export type RecipeSortKey = "default" | "price" | "protein" | "complexity";

export type SortableRecipe = {
  title: string;
  favorite?: boolean;
  estPrice?: number | null;
  proteinType?: string | null;
  complexity?: number | null;
};

export function compareTextInsensitive(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: "base" });
}

// Blank sort values always sort last; ties fall back to title (then favorite for "default"). Pure
// and stable so the meal-browser ordering matches the Recipes tab without extra DB round-trips.
export function sortRecipesBy<T extends SortableRecipe>(recipes: T[], key: RecipeSortKey): T[] {
  const byTitle = (a: T, b: T) => compareTextInsensitive(a.title, b.title);
  const numAscNullsLast = (a: number | null | undefined, b: number | null | undefined) => {
    const an = a ?? null;
    const bn = b ?? null;
    if (an === null && bn === null) return 0;
    if (an === null) return 1;
    if (bn === null) return -1;
    return an - bn;
  };
  const strAscNullsLast = (a: string | null | undefined, b: string | null | undefined) => {
    const as = (a ?? "").trim();
    const bs = (b ?? "").trim();
    if (as === "" && bs === "") return 0;
    if (as === "") return 1;
    if (bs === "") return -1;
    return compareTextInsensitive(as, bs);
  };

  const copy = [...recipes];
  switch (key) {
    case "price":
      return copy.sort((a, b) => numAscNullsLast(a.estPrice, b.estPrice) || byTitle(a, b));
    case "protein":
      return copy.sort((a, b) => strAscNullsLast(a.proteinType, b.proteinType) || byTitle(a, b));
    case "complexity":
      return copy.sort((a, b) => numAscNullsLast(a.complexity, b.complexity) || byTitle(a, b));
    default:
      return copy.sort(
        (a, b) => Number(b.favorite ?? false) - Number(a.favorite ?? false) || byTitle(a, b),
      );
  }
}
