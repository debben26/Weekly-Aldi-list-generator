import { describe, it, expect } from "vitest";
import {
  normalizeText,
  mergeContributions,
  type MergeContribution,
  type MergeItemInfo,
} from "@/services/ItemMergeService";

describe("normalizeText (spec 8.1b merge key)", () => {
  it("lowercases, trims, and collapses whitespace", () => {
    expect(normalizeText("  Cream   Cheese ")).toBe("cream cheese");
  });

  it("strips punctuation and symbols", () => {
    expect(normalizeText("2% Milk!")).toBe("2 milk");
    expect(normalizeText("Milk - 1 gal.")).toBe("milk 1 gal");
  });

  it("singularizes plural tokens deterministically", () => {
    expect(normalizeText("Tomatoes")).toBe("tomato");
    expect(normalizeText("Potatoes")).toBe("potato");
    expect(normalizeText("Black Beans")).toBe("black bean");
    expect(normalizeText("Berries")).toBe("berry");
    expect(normalizeText("Boxes")).toBe("box");
    expect(normalizeText("Bananas")).toBe("banana");
  });

  it("leaves words ending in 'ss' and short tokens alone", () => {
    expect(normalizeText("Swiss")).toBe("swiss");
    expect(normalizeText("Gas")).toBe("gas");
  });

  it("is idempotent", () => {
    const once = normalizeText("Diced Tomatoes!!");
    expect(normalizeText(once)).toBe(once);
    expect(once).toBe("diced tomato");
  });

  it("normalizes alias variants toward the same key for matching", () => {
    // spec example aliases for milk
    expect(normalizeText("2% milk")).toBe("2 milk");
    expect(normalizeText("Friendly Farms Milk")).toBe("friendly farm milk");
  });
});

// Helpers for merge tests
function contrib(over: Partial<MergeContribution>): MergeContribution {
  return {
    itemId: null,
    displayName: "x",
    normalizedName: "x",
    quantity: null,
    unit: null,
    rawText: null,
    source: { type: "manual", label: "Manual", recipeId: null },
    ...over,
  };
}

describe("mergeContributions (spec 8.1a/b — must pass)", () => {
  const cheeseInfo = new Map<string, MergeItemInfo>([
    ["cheese", { canonicalName: "Shredded Cheese", purchaseUnit: "bag", recipeToPurchase: { cup: 0.5 } }],
  ]);

  it("merges duplicates on matching canonical item identity, keeping all sources", () => {
    const rows = mergeContributions(
      [
        contrib({ itemId: "cheese", quantity: 1, unit: "bag", source: { type: "weekly_staple", label: "Weekly Staples", recipeId: null } }),
        contrib({ itemId: "cheese", quantity: 1, unit: "cup", source: { type: "recipe", label: "Taco Bowls", recipeId: "r1" } }),
      ],
      cheeseInfo,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].sources).toHaveLength(2); // provenance preserved
    expect(rows[0].sourceSummary).toBe("Weekly Staples + Taco Bowls");
  });

  it("sums same-dimension contributions with a conversion and rounds up to whole purchase units", () => {
    const [row] = mergeContributions(
      [
        contrib({ itemId: "cheese", quantity: 1, unit: "bag", source: { type: "weekly_staple", label: "Weekly Staples", recipeId: null } }),
        contrib({ itemId: "cheese", quantity: 1, unit: "cup", source: { type: "recipe", label: "Taco Bowls", recipeId: "r1" } }),
      ],
      cheeseInfo,
    );
    expect(row.aggregated).toBe(true);
    expect(row.quantity).toBe(2); // 1 bag + 0.5 bag = 1.5 -> ceil 2
    expect(row.unit).toBe("bag");
    expect(row.breakdown).toBeNull();
  });

  it("does NOT fabricate a total across incompatible units; keeps the per-source breakdown", () => {
    // same item but no cup->purchase conversion available
    const noConv = new Map<string, MergeItemInfo>([
      ["x", { canonicalName: "Mystery", purchaseUnit: "bag", recipeToPurchase: null }],
    ]);
    const [row] = mergeContributions(
      [
        contrib({ itemId: "x", quantity: 1, unit: "cup", source: { type: "recipe", label: "Taco Bowls", recipeId: "r1" } }),
        contrib({ itemId: "x", quantity: 1, unit: "bag", source: { type: "weekly_staple", label: "Weekly Staples", recipeId: null } }),
      ],
      noConv,
    );
    expect(row.aggregated).toBe(false);
    expect(row.quantity).toBeNull();
    expect(row.breakdown).toBe("1 cup [Taco Bowls] + 1 bag [Weekly Staples]");
    expect(row.sources).toHaveLength(2);
  });

  it("does not auto-merge conflicting variants (different item ids stay separate)", () => {
    const info = new Map<string, MergeItemInfo>([
      ["vanilla", { canonicalName: "Vanilla Yogurt", purchaseUnit: "each", recipeToPurchase: null }],
      ["plain", { canonicalName: "Plain Greek Yogurt", purchaseUnit: "each", recipeToPurchase: null }],
    ]);
    const rows = mergeContributions(
      [
        contrib({ itemId: "vanilla", quantity: 1, unit: "each" }),
        contrib({ itemId: "plain", quantity: 1, unit: "each" }),
      ],
      info,
    );
    expect(rows).toHaveLength(2);
  });

  it("falls back to normalized text when no item_id, and keeps distinct text separate", () => {
    const rows = mergeContributions(
      [
        contrib({ normalizedName: "lime", displayName: "Limes", quantity: 2, unit: "each" }),
        contrib({ normalizedName: "lime", displayName: "lime", quantity: 3, unit: "each" }),
        contrib({ normalizedName: "cilantro", displayName: "Cilantro", quantity: 1, unit: "bunch" }),
      ],
      new Map(),
    );
    expect(rows).toHaveLength(2);
    const limes = rows.find((r) => r.key === "text:lime")!;
    expect(limes.quantity).toBe(5); // identical units summed
    expect(limes.sources).toHaveLength(2);
  });
});
