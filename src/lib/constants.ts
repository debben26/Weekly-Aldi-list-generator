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

// --- Price estimation & grocery tax (phase2-receipts-spec.md §8.1 / §8.3) ---
// Confidence tiers by observation count: >= 3 -> high (median + IQR); 1-2 -> medium (recent ±25%);
// 0 -> low (section average / seeded baseline / generic fallback).
export const ESTIMATE_MIN_OBS_HIGH = 3;
export const ESTIMATE_SPARSE_RANGE_PCT = 0.25; // sparse range = point ± 25%
export const ESTIMATE_SECTION_RANGE_PCT = 0.4; // section-average range = avg × [0.6, 1.4]
export const ESTIMATE_BASELINE_RANGE_PCT = 0.3; // seeded-baseline range = base × [0.7, 1.3]
// Generic last-resort guess when an item has no history, no section average, and no baseline.
export const ESTIMATE_GENERIC_POINT = 3.0; // $ best-guess point
export const ESTIMATE_GENERIC_RANGE_PCT = 0.6; // generic range = point × [0.4, 1.6]
// Grocery tax: flat combined rate applied only to taxable items (8.3). Configurable later via a
// Settings store; a constant for now (WI combined ~5.5%).
export const DEFAULT_TAX_RATE = 0.055;

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
