// GroceryListGenerationService — assembles the weekly list from all sources (spec 8.1).
// M3 introduces only the two inclusion/suppression rules the milestone gate depends on
// (staple auto-add, pantry suppression). The full pipeline — recipe scaling, merge (8.1a/b),
// sectioning, and route sort — is built in M5. Kept pure for testability.

export type PantryStatus = "have" | "low" | "out" | "unknown";

/**
 * Active weekly staples are auto-included on every generated list (spec 8.1 step 2 / 6.3).
 * Deactivated staples and restock-type rules are excluded.
 */
export function activeWeeklyStaples<T extends { ruleType: string; active: boolean }>(
  rules: T[],
): T[] {
  return rules.filter((r) => r.ruleType === "weekly" && r.active);
}

/**
 * Pantry exclusion (spec 8.1 step 5 / 6.6): an item marked `have` is suppressed from the list
 * unless the user overrides it for this list. Any other status does not suppress.
 */
export function isSuppressedByPantry(
  status: PantryStatus | null | undefined,
  overridden: boolean,
): boolean {
  return status === "have" && !overridden;
}

/**
 * Serving scaling (spec 8.1 step 3): multiply a scalable ingredient quantity by
 * targetServings / baseServings. Non-scalable ingredients ("to taste", "1 pinch") and null
 * quantities are left untouched. Returns null when the quantity is unknown.
 */
export function scaleIngredientQuantity(
  quantity: number | null,
  scalable: boolean,
  baseServings: number,
  targetServings: number,
): number | null {
  if (quantity == null) return null;
  if (!scalable) return quantity;
  if (!baseServings || baseServings <= 0) return quantity; // guard divide-by-zero
  return (quantity * targetServings) / baseServings;
}
