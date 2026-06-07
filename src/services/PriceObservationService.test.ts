import { describe, it, expect } from "vitest";
import { computeUnitPrice, priceObservations } from "@/services/PriceObservationService";

describe("computeUnitPrice", () => {
  it("divides amount by quantity", () => {
    expect(computeUnitPrice(6, 2)).toBe(3);
  });
  it("returns null on missing or zero quantity", () => {
    expect(computeUnitPrice(6, null)).toBeNull();
    expect(computeUnitPrice(6, 0)).toBeNull();
    expect(computeUnitPrice(null, 2)).toBeNull();
  });
});

describe("priceObservations (spec 6.15 — estimated vs paid distinguishable)", () => {
  it("records both when estimated and paid are present", () => {
    expect(priceObservations(2.0, 2.5)).toEqual([
      { amount: 2.0, sourceType: "estimated" },
      { amount: 2.5, sourceType: "manual" },
    ]);
  });
  it("records only an estimated observation when paid is missing", () => {
    expect(priceObservations(2.0, null)).toEqual([{ amount: 2.0, sourceType: "estimated" }]);
  });
  it("records only a manual observation when estimated is missing", () => {
    expect(priceObservations(null, 2.5)).toEqual([{ amount: 2.5, sourceType: "manual" }]);
  });
  it("records nothing when no price is known (never breaks completion)", () => {
    expect(priceObservations(null, null)).toEqual([]);
  });
});
