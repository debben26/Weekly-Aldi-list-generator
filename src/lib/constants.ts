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
