import { describe, it, expect } from "vitest";
import {
  estimateItemPrice,
  quantile,
  median,
  type ObservationPoint,
} from "@/services/PriceEstimationService";

const obs = (unitPrice: number, isoDate: string): ObservationPoint => ({
  unitPrice,
  observedDate: new Date(`${isoDate}T00:00:00.000Z`),
});

describe("quantile / median", () => {
  it("interpolates linearly (numpy default)", () => {
    expect(quantile([2, 2.5, 3, 3.5], 0.25)).toBeCloseTo(2.375, 6);
    expect(quantile([2, 2.5, 3, 3.5], 0.75)).toBeCloseTo(3.125, 6);
    expect(median([2, 3, 4])).toBe(3);
    expect(median([2, 2.5, 3, 3.5])).toBeCloseTo(2.75, 6);
  });
  it("handles a single value", () => {
    expect(quantile([4.2], 0.25)).toBe(4.2);
  });
});

describe("estimateItemPrice — known (≥3 obs)", () => {
  it("≥4: point = median, range = IQR [p25, p75], high confidence", () => {
    const e = estimateItemPrice([
      obs(2.0, "2026-01-01"),
      obs(2.5, "2026-02-01"),
      obs(3.0, "2026-03-01"),
      obs(3.5, "2026-04-01"),
    ]);
    expect(e.point).toBe(2.75);
    expect(e.low).toBe(2.38);
    expect(e.high).toBe(3.13);
    expect(e.confidence).toBe("high");
    expect(e.observationCount).toBe(4);
    expect(e.basis).toMatch(/median of 4 receipts; last seen 2026-04-01/);
  });

  it("exactly 3: range = [min, max] (not IQR)", () => {
    const e = estimateItemPrice([
      obs(2.0, "2026-01-01"),
      obs(3.0, "2026-02-01"),
      obs(4.0, "2026-03-01"),
    ]);
    expect(e.point).toBe(3.0);
    expect(e.low).toBe(2.0);
    expect(e.high).toBe(4.0);
    expect(e.confidence).toBe("high");
  });
});

describe("estimateItemPrice — sparse (1–2 obs)", () => {
  it("1 obs: point = that price, range ±25%, medium", () => {
    const e = estimateItemPrice([obs(2.0, "2026-05-01")]);
    expect(e).toMatchObject({
      point: 2.0,
      low: 1.5,
      high: 2.5,
      confidence: "medium",
      observationCount: 1,
    });
    expect(e.basis).toBe("based on 1 recent receipt");
  });

  it("2 obs: point = the most RECENT observation", () => {
    const e = estimateItemPrice([obs(2.0, "2026-01-01"), obs(3.0, "2026-06-01")]);
    expect(e.point).toBe(3.0); // newer wins, not the average
    expect(e.low).toBe(2.25);
    expect(e.high).toBe(3.75);
    expect(e.confidence).toBe("medium");
    expect(e.basis).toBe("based on 2 recent receipts");
    expect(e.lastObserved?.toISOString().slice(0, 10)).toBe("2026-06-01");
  });
});

describe("estimateItemPrice — unknown (0 obs), fallbacks in order", () => {
  it("section average first: range = avg × [0.6, 1.4], low confidence", () => {
    const e = estimateItemPrice([], {
      sectionName: "Produce",
      sectionAverage: 5.0,
      seededBaseline: 4.0, // present, but section average wins
    });
    expect(e.point).toBe(5.0);
    expect(e.low).toBe(3.0);
    expect(e.high).toBe(7.0);
    expect(e.confidence).toBe("low");
    expect(e.observationCount).toBe(0);
    expect(e.basis).toBe("section average (Produce), no history for this item");
  });

  it("seeded baseline when no section average: range = base × [0.7, 1.3]", () => {
    const e = estimateItemPrice([], {
      sectionName: "Pantry",
      sectionAverage: null,
      seededBaseline: 4.0,
    });
    expect(e.point).toBe(4.0);
    expect(e.low).toBe(2.8);
    expect(e.high).toBe(5.2);
    expect(e.confidence).toBe("low");
    expect(e.basis).toBe("seeded baseline price, no receipts yet");
  });

  it("generic fallback when nothing else: labeled best guess", () => {
    const e = estimateItemPrice([]);
    expect(e.point).toBe(3.0);
    expect(e.low).toBe(1.2);
    expect(e.high).toBe(4.8);
    expect(e.confidence).toBe("low");
    expect(e.basis).toBe("best guess, no data");
  });
});
