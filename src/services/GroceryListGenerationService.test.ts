import { describe, it, expect } from "vitest";
import {
  activeWeeklyStaples,
  isSuppressedByPantry,
  scaleIngredientQuantity,
} from "@/services/GroceryListGenerationService";

describe("activeWeeklyStaples (spec 6.3 / 8.1)", () => {
  const rules = [
    { id: "a", ruleType: "weekly", active: true },
    { id: "b", ruleType: "weekly", active: false }, // deactivated
    { id: "c", ruleType: "restock", active: true }, // not auto-added
  ];

  it("includes active weekly staples", () => {
    expect(activeWeeklyStaples(rules).map((r) => r.id)).toEqual(["a"]);
  });

  it("excludes deactivated staples", () => {
    expect(activeWeeklyStaples(rules).some((r) => r.id === "b")).toBe(false);
  });

  it("excludes restock-type rules", () => {
    expect(activeWeeklyStaples(rules).some((r) => r.id === "c")).toBe(false);
  });
});

describe("isSuppressedByPantry (spec 6.6 / 8.1 step 5)", () => {
  it("suppresses an item marked have", () => {
    expect(isSuppressedByPantry("have", false)).toBe(true);
  });

  it("re-adds it when the user overrides", () => {
    expect(isSuppressedByPantry("have", true)).toBe(false);
  });

  it("does not suppress for low/out/unknown/missing", () => {
    expect(isSuppressedByPantry("low", false)).toBe(false);
    expect(isSuppressedByPantry("out", false)).toBe(false);
    expect(isSuppressedByPantry("unknown", false)).toBe(false);
    expect(isSuppressedByPantry(null, false)).toBe(false);
  });
});

describe("scaleIngredientQuantity (spec 8.1 — must pass)", () => {
  it("scales a scalable ingredient by target/base", () => {
    expect(scaleIngredientQuantity(2, true, 4, 8)).toBe(4); // double servings
    expect(scaleIngredientQuantity(1, true, 4, 2)).toBe(0.5); // half servings
  });

  it("leaves a scalable=false ingredient untouched", () => {
    expect(scaleIngredientQuantity(1, false, 4, 8)).toBe(1); // "1 pinch" stays 1
  });

  it("leaves a null quantity as null", () => {
    expect(scaleIngredientQuantity(null, true, 4, 8)).toBeNull();
  });

  it("guards divide-by-zero base servings", () => {
    expect(scaleIngredientQuantity(2, true, 0, 8)).toBe(2);
  });
});
