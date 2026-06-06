import { describe, it, expect } from "vitest";
import { DEFAULT_SECTION_ORDER, OTHER_SECTION_NAME } from "@/lib/constants";
import { STARTER_CATALOG } from "@/lib/seed-data";

describe("default sections", () => {
  it("always includes the Other / Unassigned fallback section (spec 5.2)", () => {
    expect(DEFAULT_SECTION_ORDER).toContain(OTHER_SECTION_NAME);
  });

  it("places Other / Unassigned last so it is the final fallback in route order", () => {
    expect(DEFAULT_SECTION_ORDER.at(-1)).toBe(OTHER_SECTION_NAME);
  });

  it("has no duplicate section names", () => {
    expect(new Set(DEFAULT_SECTION_ORDER).size).toBe(DEFAULT_SECTION_ORDER.length);
  });
});

describe("starter catalog (spec 6.0 + Appendix A)", () => {
  it("seeds roughly 100 items", () => {
    expect(STARTER_CATALOG.length).toBeGreaterThanOrEqual(95);
    expect(STARTER_CATALOG.length).toBeLessThanOrEqual(110);
  });

  it("has unique item names", () => {
    const names = STARTER_CATALOG.map((i) => i.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("references only known sections", () => {
    const known = new Set(DEFAULT_SECTION_ORDER);
    for (const item of STARTER_CATALOG) {
      expect(known.has(item.section)).toBe(true);
    }
  });

  it("gives every item a purchase unit", () => {
    for (const item of STARTER_CATALOG) {
      expect(item.purchaseUnit.length).toBeGreaterThan(0);
    }
  });

  it("carries the documented recipe_to_purchase hints", () => {
    const cheese = STARTER_CATALOG.find((i) => i.name === "Shredded Cheese");
    const milk = STARTER_CATALOG.find((i) => i.name === "Milk (2%)");
    expect(cheese?.recipeToPurchase).toEqual({ cup: 0.5 });
    expect(milk?.recipeToPurchase).toEqual({ cup: 0.0625 });
  });
});
