import { describe, it, expect } from "vitest";
import { dimensionForPurchaseUnit, PURCHASE_UNITS } from "@/services/UnitService";

describe("dimensionForPurchaseUnit (spec 5.3a)", () => {
  it("maps known units to their quantity dimension", () => {
    expect(dimensionForPurchaseUnit("gallon")).toBe("volume");
    expect(dimensionForPurchaseUnit("half_gallon")).toBe("volume");
    expect(dimensionForPurchaseUnit("lb")).toBe("weight");
    expect(dimensionForPurchaseUnit("oz_package")).toBe("weight");
    expect(dimensionForPurchaseUnit("each")).toBe("count");
    expect(dimensionForPurchaseUnit("dozen")).toBe("count");
    expect(dimensionForPurchaseUnit("bunch")).toBe("count");
    expect(dimensionForPurchaseUnit("bag")).toBe("package");
    expect(dimensionForPurchaseUnit("jar")).toBe("package");
    expect(dimensionForPurchaseUnit("can")).toBe("package");
  });

  it("falls back to package for unknown/custom units", () => {
    expect(dimensionForPurchaseUnit("flat")).toBe("package");
    expect(dimensionForPurchaseUnit("")).toBe("package");
  });

  it("classifies every known purchase unit", () => {
    for (const unit of PURCHASE_UNITS) {
      expect(["volume", "weight", "count", "package"]).toContain(
        dimensionForPurchaseUnit(unit),
      );
    }
  });
});
