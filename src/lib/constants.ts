// Deterministic, named constants shared by services and seed (spec: "named constants so
// thresholds and ranking weights are testable"). Milestone-specific thresholds get added here
// as their services are built (M3 restock, M4 Aldi-fit/meal scoring, M5 units).

// The fallback section. Spec 5.2: this one must always exist.
export const OTHER_SECTION_NAME = "Other / Unassigned";

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
