import { describe, it, expect } from "vitest";
import { estimateOrder, type OrderLineInput } from "@/services/OrderEstimationService";
import type { PriceEstimate, EstimateConfidence } from "@/services/PriceEstimationService";

const est = (
  point: number,
  low: number,
  high: number,
  confidence: EstimateConfidence,
  observationCount: number,
): PriceEstimate => ({
  point,
  low,
  high,
  confidence,
  basis: "x",
  observationCount,
  lastObserved: null,
});

const lines: OrderLineInput[] = [
  { displayName: "Milk", quantity: 1, taxable: false, estimate: est(2.79, 2.5, 3.0, "high", 4) },
  { displayName: "Paper Towels", quantity: 2, taxable: true, estimate: est(6.0, 5.0, 7.0, "medium", 2) },
  { displayName: "Mystery", quantity: 1, taxable: false, estimate: est(3.0, 1.2, 4.8, "low", 0) },
];

describe("estimateOrder", () => {
  it("subtotal = Σ points; range = Σ lows … Σ highs (qty-scaled)", () => {
    const o = estimateOrder(lines, 0.055);
    expect(o.subtotal.point).toBe(17.79); // 2.79 + 6·2 + 3
    expect(o.subtotal.low).toBe(13.7); // 2.5 + 5·2 + 1.2
    expect(o.subtotal.high).toBe(21.8); // 3 + 7·2 + 4.8
  });

  it("taxes only taxable lines at the flat rate; exempt food untaxed", () => {
    const o = estimateOrder(lines, 0.055);
    // Only Paper Towels (qty 2) is taxable: 12 · 0.055 = 0.66 point.
    expect(o.tax.point).toBe(0.66);
    expect(o.tax.low).toBe(0.55); // 10 · 0.055
    expect(o.tax.high).toBe(0.77); // 14 · 0.055
    expect(o.total.point).toBe(18.45); // 17.79 + 0.66
    expect(o.total.low).toBe(14.25);
    expect(o.total.high).toBe(22.57);
  });

  it("counts lines backed by real history and never omits no-history lines", () => {
    const o = estimateOrder(lines, 0.055);
    expect(o.totalLines).toBe(3);
    expect(o.fromHistoryCount).toBe(2); // Milk + Paper Towels (obs > 0); Mystery is a guess
    expect(o.summary).toBe("2 of 3 items based on real history");
    const mystery = o.lines.find((l) => l.displayName === "Mystery");
    expect(mystery).toBeTruthy(); // still present
    expect(mystery!.fromHistory).toBe(false);
    expect(mystery!.confidence).toBe("low");
  });

  it("preserves section metadata for grouped review displays", () => {
    const o = estimateOrder(
      [
        { ...lines[0], sectionId: "dairy", sectionName: "Dairy", sectionSort: 2 },
        { ...lines[1], sectionId: "paper", sectionName: "Paper", sectionSort: 4 },
      ],
      0,
    );

    expect(o.lines.map((l) => [l.displayName, l.sectionId, l.sectionName, l.sectionSort])).toEqual([
      ["Milk", "dairy", "Dairy", 2],
      ["Paper Towels", "paper", "Paper", 4],
    ]);
  });

  it("zero tax rate yields subtotal = total", () => {
    const o = estimateOrder(lines, 0);
    expect(o.tax.point).toBe(0);
    expect(o.total.point).toBe(o.subtotal.point);
  });
});
