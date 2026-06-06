import { describe, it, expect } from "vitest";
import { normalizeText } from "@/services/ItemMergeService";

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
