// Deterministic, named constants shared by services and seed (spec: "named constants so
// thresholds and ranking weights are testable"). Milestone-specific thresholds get added here
// as their services are built (M3 restock, M4 Aldi-fit/meal scoring, M5 units).

// The fallback section. Spec 5.2: this one must always exist.
export const OTHER_SECTION_NAME = "Other / Unassigned";

// --- Restock suggestion thresholds (spec 8.2) ---
// ratio = days_since_last_purchase / effective_interval_days
export const RESTOCK_DUE_RATIO = 1.0; // ratio >= 1.0 -> due
export const RESTOCK_MAYBE_DUE_RATIO = 0.8; // 0.8 <= ratio < 1.0 -> maybe_due
// Learned cadence requires >= 3 prior purchases; below that, fall back to the manual interval.
export const MIN_PURCHASES_FOR_LEARNED_CADENCE = 3;
// Confidence: high if learned from >= 5 observations; medium if 3-4 obs or a manual interval.
export const HIGH_CONFIDENCE_MIN_OBS = 5;

// --- Aldi fit thresholds (spec 8.4) ---
export const ALDI_FIT_GOOD_MIN = 0.8; // fit >= 0.8 -> good
export const ALDI_FIT_MEDIUM_MIN = 0.5; // 0.5 <= fit < 0.8 -> medium
// If fewer than this fraction of ingredients are mapped to items, fit is unjudgeable -> unknown.
export const ALDI_FIT_MIN_MAPPED_FRACTION = 0.5;

// --- Meal suggestion ranking weights (spec 8.3) ---
// Named so the deterministic ranking is testable and stable.
export const MEAL_WEIGHT_FAVORITE = 5;
export const MEAL_ALDI_FIT_SCORE: Record<string, number> = {
  good: 3,
  medium: 1.5,
  low: 0,
  unknown: 0,
};
export const MEAL_RECENCY_PENALTY_MAX = 5; // strongest penalty for a just-used recipe
export const MEAL_RECENCY_WINDOW_DAYS = 30; // penalty fades to 0 across this window
export const MEAL_WEIGHT_PANTRY_OVERLAP = 0.5; // per ingredient already on hand
export const MEAL_COST_REFERENCE = 20; // $ baseline; cheaper-than-baseline earns a small boost
export const MEAL_WEIGHT_COST = 2;

// Default Aldi route order (spec 5.2). Other / Unassigned is always last.
export const DEFAULT_SECTION_ORDER: string[] = [
  "Produce",
  "Bakery / Bread",
  "Deli / Refrigerated",
  "Meat",
  "Dairy",
  "Frozen",
  "Pantry",
  "Canned Goods",
  "Baking and Spices",
  "Snacks",
  "Household",
  OTHER_SECTION_NAME,
];
