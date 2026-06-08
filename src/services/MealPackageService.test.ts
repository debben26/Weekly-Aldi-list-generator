import { describe, it, expect } from "vitest";
import {
  clampMealCount,
  selectPackage,
  pickReplacement,
  searchRecipesByName,
  MEAL_COUNT_DEFAULT,
  MEAL_COUNT_MIN,
  MEAL_COUNT_MAX,
} from "@/services/MealPackageService";

const ranked = (...ids: string[]) => ids.map((recipeId) => ({ input: { recipeId } }));

describe("clampMealCount", () => {
  it("keeps in-range values", () => {
    expect(clampMealCount(4)).toBe(4);
  });
  it("clamps below the minimum and above the maximum", () => {
    expect(clampMealCount(0)).toBe(MEAL_COUNT_MIN);
    expect(clampMealCount(99)).toBe(MEAL_COUNT_MAX);
  });
  it("floors fractions and falls back to default for non-numbers", () => {
    expect(clampMealCount(3.9)).toBe(3);
    expect(clampMealCount(NaN)).toBe(MEAL_COUNT_DEFAULT);
  });
});

describe("selectPackage", () => {
  it("takes the top N in ranked order", () => {
    expect(selectPackage(ranked("a", "b", "c", "d"), 2)).toEqual(["a", "b"]);
  });
  it("skips excluded recipes", () => {
    expect(selectPackage(ranked("a", "b", "c"), 2, ["a"])).toEqual(["b", "c"]);
  });
  it("returns fewer than N when the database is under-supplied (spec 15.1)", () => {
    expect(selectPackage(ranked("a", "b"), 5)).toEqual(["a", "b"]);
  });
});

describe("pickReplacement", () => {
  it("returns the highest-ranked recipe not already in use", () => {
    expect(pickReplacement(ranked("a", "b", "c"), ["a"])).toBe("b");
  });
  it("returns null when no fresh option remains", () => {
    expect(pickReplacement(ranked("a", "b"), ["a", "b"])).toBeNull();
  });
});

describe("searchRecipesByName", () => {
  const recipes = [{ title: "Chicken Tacos" }, { title: "Beef Taco Bowls" }, { title: "Spaghetti" }];
  it("matches case-insensitively on substring", () => {
    expect(searchRecipesByName(recipes, "taco").map((r) => r.title)).toEqual([
      "Chicken Tacos",
      "Beef Taco Bowls",
    ]);
  });
  it("returns everything for an empty query", () => {
    expect(searchRecipesByName(recipes, "  ")).toHaveLength(3);
  });
});
