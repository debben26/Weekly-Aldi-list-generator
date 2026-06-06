import { describe, it, expect } from "vitest";
import {
  activeWeeklyStaples,
  isSuppressedByPantry,
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
