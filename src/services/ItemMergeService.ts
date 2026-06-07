// ItemMergeService — duplicate detection & quantity aggregation (spec 8.1a / 8.1b).
import { dimensionForPurchaseUnit } from "@/services/UnitService";
// `normalizeText` is the merge-key normalizer (also used to store aliases). `mergeContributions`
// groups contributions and aggregates quantities without ever fabricating an uncomputable total.

// Words that already end in "s" but are singular / shouldn't be stripped naively are handled by
// the rules below; this is a deliberately small, deterministic singularizer (not a full
// inflector) — same input always yields the same output.
function singularizeToken(token: string): string {
  if (token.length <= 3) return token; // gas, oat... leave short tokens alone
  if (token.endsWith("ies")) return token.slice(0, -3) + "y"; // berries -> berry
  if (token.endsWith("oes")) return token.slice(0, -2); // tomatoes -> tomato
  if (/(ses|xes|zes|ches|shes)$/.test(token)) return token.slice(0, -2); // boxes -> box
  if (token.endsWith("ss")) return token; // glass -> glass
  if (token.endsWith("s")) return token.slice(0, -1); // tomatoes->tomatoe? handled below
  return token;
}

/**
 * Normalize free text for merge matching and alias storage (spec 8.1b):
 * lowercase, strip punctuation, collapse whitespace, singularize each token.
 * Deterministic and idempotent.
 */
export function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ") // strip punctuation/symbols
    .split(/\s+/)
    .filter(Boolean)
    .map(singularizeToken)
    .join(" ");
}

// ---------- Duplicate merge + quantity aggregation (spec 8.1a / 8.1b) ----------

export type MergeSourceType =
  | "weekly_staple"
  | "restock"
  | "pantry_review"
  | "manual"
  | "recipe";

// One source's request for an item. Free-text contributions must already be resolved to an
// item_id by the caller when an alias/canonical match exists (8.1b); otherwise itemId is null
// and matching falls back to normalizedName.
export type MergeContribution = {
  itemId: string | null;
  displayName: string;
  normalizedName: string;
  quantity: number | null;
  unit: string | null; // unit as contributed (recipe unit or purchase unit)
  rawText: string | null;
  source: { type: MergeSourceType; label: string; recipeId: string | null };
};

export type MergeItemInfo = {
  canonicalName: string;
  purchaseUnit: string | null;
  recipeToPurchase: Record<string, number> | null;
};

export type MergedSource = {
  type: MergeSourceType;
  label: string;
  recipeId: string | null;
  quantity: number | null;
  unit: string | null;
  rawText: string | null;
};

export type MergedRow = {
  key: string;
  itemId: string | null;
  displayName: string;
  quantity: number | null;
  unit: string | null;
  aggregated: boolean;
  /** Verbatim per-source breakdown when a total can't be computed (8.1a). */
  breakdown: string | null;
  sourceSummary: string;
  sources: MergedSource[];
};

function fmtQty(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : String(Number(n.toFixed(3)));
}

// Quantity aggregation (spec 8.1a). Returns a single total only when every contribution can be
// converted to the item's purchase unit; otherwise no total is fabricated.
function aggregate(
  group: MergeContribution[],
  info: MergeItemInfo | null,
): { quantity: number | null; unit: string | null; aggregated: boolean } {
  const purchaseUnit = info?.purchaseUnit ?? null;

  if (purchaseUnit) {
    // Convert each contribution to purchase units: factor 1 if already in purchase units,
    // else a known recipe->purchase conversion, else not convertible.
    const puDim = dimensionForPurchaseUnit(purchaseUnit);
    const converted = group.map((c) => {
      if (c.quantity == null) return null;
      if (c.unit === purchaseUnit) return c.quantity;
      const factor = info?.recipeToPurchase?.[c.unit ?? ""];
      if (factor == null) return null;
      // Guard (spec 8.1a): if both units have a known, distinct dimension, they cannot be summed
      // even if a recipeToPurchase entry happens to exist for both (data-entry error defence).
      // Units that fall back to "package" (recipe units like cup/tbsp, or unknown units) are
      // trusted to the explicit conversion factor and bypass this check.
      const cDim = dimensionForPurchaseUnit(c.unit ?? "");
      if (puDim !== "package" && cDim !== "package" && puDim !== cDim) return null;
      return c.quantity * factor;
    });
    if (converted.every((v) => v != null)) {
      const total = converted.reduce<number>((a, b) => a + (b ?? 0), 0);
      return { quantity: Math.ceil(total), unit: purchaseUnit, aggregated: true }; // can't buy 1.3 bags
    }
    return { quantity: null, unit: null, aggregated: false };
  }

  // No item_id / unknown purchase unit: only safe to sum when units are identical.
  const units = [...new Set(group.map((c) => c.unit ?? ""))];
  if (units.length === 1 && group.every((c) => c.quantity != null)) {
    const total = group.reduce((a, c) => a + (c.quantity ?? 0), 0);
    return { quantity: total, unit: units[0] || null, aggregated: true };
  }
  return { quantity: null, unit: null, aggregated: false };
}

/**
 * Merge contributions into list rows (spec 8.1a/b). Groups by canonical item_id, else by
 * normalized text. Never merges across differing item_id or differing normalized text, so
 * conflicting variants stay separate. Every row keeps all of its sources.
 */
export function mergeContributions(
  contributions: MergeContribution[],
  itemInfoById: Map<string, MergeItemInfo>,
): MergedRow[] {
  const groups = new Map<string, MergeContribution[]>();
  for (const c of contributions) {
    const key = c.itemId ? `id:${c.itemId}` : `text:${c.normalizedName}`;
    const list = groups.get(key);
    if (list) list.push(c);
    else groups.set(key, [c]);
  }

  const rows: MergedRow[] = [];
  for (const [key, group] of groups) {
    const itemId = group[0].itemId;
    const info = itemId ? (itemInfoById.get(itemId) ?? null) : null;
    const displayName = info?.canonicalName ?? group[0].displayName;
    const agg = aggregate(group, info);

    const sources: MergedSource[] = group.map((c) => ({
      type: c.source.type,
      label: c.source.label,
      recipeId: c.source.recipeId,
      quantity: c.quantity,
      unit: c.unit,
      rawText: c.rawText,
    }));

    const breakdown = agg.aggregated
      ? null
      : group
          .map((c) =>
            `${fmtQty(c.quantity)} ${c.unit ?? ""} [${c.source.label}]`.replace(/\s+/g, " ").trim(),
          )
          .join(" + ");

    rows.push({
      key,
      itemId,
      displayName,
      quantity: agg.quantity,
      unit: agg.unit,
      aggregated: agg.aggregated,
      breakdown,
      sourceSummary: [...new Set(group.map((c) => c.source.label))].join(" + "),
      sources,
    });
  }
  return rows;
}
