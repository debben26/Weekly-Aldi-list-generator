import { describe, it, expect } from "vitest";
import {
  computeAldiFit,
  scoreRecipe,
  rankRecipes,
  type RecipeScoreInput,
} from "@/services/MealSuggestionService";

const mapped = (aldiFriendly: boolean) => ({ itemId: "x", aldiFriendly });
const unmapped = () => ({ itemId: null, aldiFriendly: null });

describe("computeAldiFit (spec 8.4 — must pass thresholds)", () => {
  it("good when fit >= 0.8", () => {
    // 4 of 5 mapped are aldi-friendly = 0.8
    expect(
      computeAldiFit([mapped(true), mapped(true), mapped(true), mapped(true), mapped(false)]),
    ).toBe("good");
  });

  it("medium when 0.5 <= fit < 0.8", () => {
    expect(computeAldiFit([mapped(true), mapped(false)])).toBe("medium"); // 0.5
  });

  it("low when fit < 0.5", () => {
    expect(computeAldiFit([mapped(true), mapped(false), mapped(false)])).toBe("low"); // 0.33
  });

  it("unknown when fewer than 50% of ingredients are mapped", () => {
    // 1 mapped of 3 total = 0.33 mapped fraction
    expect(computeAldiFit([mapped(true), unmapped(), unmapped()])).toBe("unknown");
  });

  it("unknown when there are no ingredients", () => {
    expect(computeAldiFit([])).toBe("unknown");
  });
});

describe("scoreRecipe / rankRecipes (spec 8.3 — deterministic)", () => {
  const base: RecipeScoreInput = {
    recipeId: "r",
    title: "R",
    favorite: false,
    aldiFitStatus: "unknown",
    daysSinceLastUsed: null,
    pantryOverlapCount: 0,
    estimatedCost: null,
  };

  it("boosts favorites above otherwise-identical recipes", () => {
    expect(scoreRecipe({ ...base, favorite: true })).toBeGreaterThan(scoreRecipe(base));
  });

  it("penalizes recently-used recipes", () => {
    const recent = scoreRecipe({ ...base, daysSinceLastUsed: 1 });
    const old = scoreRecipe({ ...base, daysSinceLastUsed: 60 });
    expect(recent).toBeLessThan(old);
  });

  it("ranks higher Aldi fit above lower", () => {
    expect(scoreRecipe({ ...base, aldiFitStatus: "good" })).toBeGreaterThan(
      scoreRecipe({ ...base, aldiFitStatus: "low" }),
    );
  });

  it("boosts pantry overlap", () => {
    expect(scoreRecipe({ ...base, pantryOverlapCount: 3 })).toBeGreaterThan(scoreRecipe(base));
  });

  it("orders by score desc, tie-broken by title", () => {
    const ranked = rankRecipes([
      { ...base, recipeId: "a", title: "Zebra", favorite: false },
      { ...base, recipeId: "b", title: "Apple", favorite: true }, // highest (favorite)
      { ...base, recipeId: "c", title: "Mango", favorite: false },
    ]);
    expect(ranked.map((r) => r.input.title)).toEqual(["Apple", "Mango", "Zebra"]);
  });

  it("is deterministic for identical input", () => {
    expect(scoreRecipe(base)).toBe(scoreRecipe(base));
  });
});
