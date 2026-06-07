import { describe, it, expect } from "vitest";
import {
  ANALYTICS_DEFAULT_WINDOW_MONTHS,
  windowStart,
  aggregateSpendBySection,
  mealFrequency,
  purchaseFrequency,
} from "@/services/AnalyticsService";

describe("windowStart (spec 6.15 — default 6 months)", () => {
  it("defaults to 6 months back", () => {
    expect(ANALYTICS_DEFAULT_WINDOW_MONTHS).toBe(6);
    const start = windowStart(new Date("2026-06-15"));
    expect(start.toISOString().slice(0, 10)).toBe("2025-12-15");
  });

  it("clamps to the last day of the target month (no JS setMonth overflow)", () => {
    // July 31 - 6 months = January 31 (January has 31 days — no overflow)
    expect(windowStart(new Date("2026-07-31")).toISOString().slice(0, 10)).toBe("2026-01-31");
    // Aug 31 - 6 months = Feb 28 (Feb 2026 has 28 days; without fix would roll to Mar 3)
    expect(windowStart(new Date("2026-08-31")).toISOString().slice(0, 10)).toBe("2026-02-28");
    // Mar 31 - 6 months = Sep 30 (Sep has 30 days; without fix would roll to Oct 1)
    expect(windowStart(new Date("2026-03-31")).toISOString().slice(0, 10)).toBe("2025-09-30");
  });
});

describe("aggregateSpendBySection", () => {
  it("sums paid price by section, descending, ignoring null prices", () => {
    const rows = aggregateSpendBySection([
      { sectionName: "Dairy", paidPrice: 3 },
      { sectionName: "Dairy", paidPrice: 2 },
      { sectionName: "Meat", paidPrice: 10 },
      { sectionName: "Meat", paidPrice: null },
      { sectionName: null, paidPrice: 1 },
    ]);
    expect(rows).toEqual([
      { section: "Meat", total: 10 },
      { section: "Dairy", total: 5 },
      { section: "Unassigned", total: 1 },
    ]);
  });
});

describe("mealFrequency", () => {
  it("counts recipe selections, descending by count", () => {
    const rows = mealFrequency([
      { recipeId: "a", title: "Tacos" },
      { recipeId: "a", title: "Tacos" },
      { recipeId: "b", title: "Soup" },
    ]);
    expect(rows).toEqual([
      { recipeId: "a", title: "Tacos", count: 2 },
      { recipeId: "b", title: "Soup", count: 1 },
    ]);
  });
});

describe("purchaseFrequency (spec 6.15 — how many times did we buy X)", () => {
  it("counts checked snapshot lines by item", () => {
    const rows = purchaseFrequency([
      { itemId: "milk", displayName: "Milk (2%)", checked: true },
      { itemId: "milk", displayName: "Milk (2%)", checked: true },
      { itemId: "milk", displayName: "Milk (2%)", checked: false }, // not purchased
      { itemId: "eggs", displayName: "Eggs", checked: true },
    ]);
    expect(rows[0]).toEqual({ key: "milk", displayName: "Milk (2%)", count: 2 });
    expect(rows.find((r) => r.key === "eggs")?.count).toBe(1);
  });
});
