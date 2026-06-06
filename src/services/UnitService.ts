// UnitService — purchase/recipe unit knowledge (spec 5.3a / 8.1a).
// Phase 1 (M2): dimension derivation + the known purchase-unit vocabulary.
// Recipe→purchase conversion + aggregation (8.1a) arrive in M5.
//
// Kept import-light (no Prisma, no "@/" alias) so the tsx seed runner can load it transitively.

// Mirrors the Prisma `Dimension` enum.
export type Dimension = "volume" | "weight" | "count" | "package";

// Known purchase units (spec 5.3a). "enum-ish" — users may type others; those fall back to
// the `package` dimension. Used to populate the Item form and to derive a dimension.
export const PURCHASE_UNITS = [
  "each",
  "bag",
  "box",
  "jar",
  "can",
  "loaf",
  "bunch",
  "dozen",
  "lb",
  "oz_package",
  "gallon",
  "half_gallon",
] as const;

const VOLUME_UNITS = new Set(["gallon", "half_gallon"]);
const WEIGHT_UNITS = new Set(["lb", "oz_package"]);
const COUNT_UNITS = new Set(["each", "dozen", "bunch"]);

// Map a purchase unit to its quantity dimension (spec 5.3a). Unknown/packaged units ->
// `package` so two such quantities are not assumed addable by the merge engine.
export function dimensionForPurchaseUnit(unit: string): Dimension {
  if (VOLUME_UNITS.has(unit)) return "volume";
  if (WEIGHT_UNITS.has(unit)) return "weight";
  if (COUNT_UNITS.has(unit)) return "count";
  return "package";
}
