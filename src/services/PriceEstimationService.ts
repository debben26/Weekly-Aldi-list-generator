// PriceEstimationService — deterministic per-item price estimate (phase2-receipts-spec.md §8.1).
// Pure (no Prisma, no LLM): the DB layer (src/app/grocery-list/estimate.ts) fetches observations
// within the 6-month window and supplies the fallbacks; this module just computes. Same inputs
// always yield the same estimate.

import {
  ESTIMATE_MIN_OBS_HIGH,
  ESTIMATE_SPARSE_RANGE_PCT,
  ESTIMATE_SECTION_RANGE_PCT,
  ESTIMATE_BASELINE_RANGE_PCT,
  ESTIMATE_GENERIC_POINT,
  ESTIMATE_GENERIC_RANGE_PCT,
} from "@/lib/constants";

export type EstimateConfidence = "high" | "medium" | "low";

export type PriceEstimate = {
  point: number;
  low: number;
  high: number;
  confidence: EstimateConfidence;
  basis: string;
  observationCount: number;
  lastObserved: Date | null;
};

// One real (paid) price observation for an item: a per-purchase-unit price and when it was seen.
export type ObservationPoint = { unitPrice: number; observedDate: Date };

// ---- statistics (deterministic) ----

function sortedAsc(values: number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

// Linear-interpolation quantile (the numpy default): p in [0,1] over a sorted, non-empty array.
export function quantile(values: number[], p: number): number {
  const s = sortedAsc(values);
  if (s.length === 1) return s[0];
  const idx = (s.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return s[lo];
  return s[lo] + (s[hi] - s[lo]) * (idx - lo);
}

export function median(values: number[]): number {
  return quantile(values, 0.5);
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// ---- the estimate ----

export type EstimateFallbacks = {
  sectionName: string | null;
  sectionAverage: number | null; // mean of point estimates of OTHER items in the same section
  seededBaseline: number | null; // from a source_type = estimated observation
};

const NO_FALLBACKS: EstimateFallbacks = {
  sectionName: null,
  sectionAverage: null,
  seededBaseline: null,
};

/**
 * Per-item estimate (§8.1). Three cases:
 * - Known (count ≥ 3): point = median; range = IQR [p25, p75] for ≥ 4 else [min, max]; high.
 * - Sparse (1–2): point = most recent observation; range = ±25%; medium.
 * - Unknown (0): section average → seeded baseline → generic fallback; low.
 */
export function estimateItemPrice(
  obs: ObservationPoint[],
  fallbacks: EstimateFallbacks = NO_FALLBACKS,
): PriceEstimate {
  const count = obs.length;

  if (count >= ESTIMATE_MIN_OBS_HIGH) {
    const prices = obs.map((o) => o.unitPrice);
    const point = median(prices);
    const [low, high] =
      count >= 4
        ? [quantile(prices, 0.25), quantile(prices, 0.75)]
        : [Math.min(...prices), Math.max(...prices)];
    const lastObserved = mostRecentDate(obs);
    return {
      point: round2(point),
      low: round2(low),
      high: round2(high),
      confidence: "high",
      basis: `median of ${count} receipts; last seen ${fmtDate(lastObserved)}`,
      observationCount: count,
      lastObserved,
    };
  }

  if (count >= 1) {
    const recent = obs.reduce((a, b) => (b.observedDate > a.observedDate ? b : a));
    const point = recent.unitPrice;
    return {
      point: round2(point),
      low: round2(point * (1 - ESTIMATE_SPARSE_RANGE_PCT)),
      high: round2(point * (1 + ESTIMATE_SPARSE_RANGE_PCT)),
      confidence: "medium",
      basis: `based on ${count} recent receipt${count > 1 ? "s" : ""}`,
      observationCount: count,
      lastObserved: recent.observedDate,
    };
  }

  // Unknown (count 0): resolve in order, stop at first hit.
  if (fallbacks.sectionAverage != null) {
    const avg = fallbacks.sectionAverage;
    return lowEstimate(
      avg,
      avg * (1 - ESTIMATE_SECTION_RANGE_PCT),
      avg * (1 + ESTIMATE_SECTION_RANGE_PCT),
      `section average (${fallbacks.sectionName ?? "unassigned"}), no history for this item`,
    );
  }
  if (fallbacks.seededBaseline != null) {
    const base = fallbacks.seededBaseline;
    return lowEstimate(
      base,
      base * (1 - ESTIMATE_BASELINE_RANGE_PCT),
      base * (1 + ESTIMATE_BASELINE_RANGE_PCT),
      "seeded baseline price, no receipts yet",
    );
  }
  return lowEstimate(
    ESTIMATE_GENERIC_POINT,
    ESTIMATE_GENERIC_POINT * (1 - ESTIMATE_GENERIC_RANGE_PCT),
    ESTIMATE_GENERIC_POINT * (1 + ESTIMATE_GENERIC_RANGE_PCT),
    "best guess, no data",
  );
}

function mostRecentDate(obs: ObservationPoint[]): Date {
  return obs.reduce((a, b) => (b.observedDate > a.observedDate ? b : a)).observedDate;
}

function lowEstimate(point: number, low: number, high: number, basis: string): PriceEstimate {
  return {
    point: round2(point),
    low: round2(low),
    high: round2(high),
    confidence: "low",
    basis,
    observationCount: 0,
    lastObserved: null,
  };
}
