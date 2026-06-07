import { describe, it, expect } from "vitest";
import { computeUnitPrice, selectObservation } from "@/services/PriceObservationService";

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

describe("selectObservation (spec 6.14 — estimated vs paid distinct)", () => {
  it("prefers the paid price and labels it manual", () => {
    expect(selectObservation(2.0, 2.5)).toEqual({ amount: 2.5, sourceType: "manual" });
  });
  it("falls back to the estimate", () => {
    expect(selectObservation(2.0, null)).toEqual({ amount: 2.0, sourceType: "estimated" });
  });
  it("returns null when no price is known (never breaks completion)", () => {
    expect(selectObservation(null, null)).toBeNull();
  });
});
