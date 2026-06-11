// OrderEstimationService — deterministic total-order estimate (phase2-receipts-spec.md §8.2 / §8.3).
// Pure (no Prisma): the DB layer (src/app/grocery-list/estimate.ts) resolves each line's per-item
// estimate (§8.1) and taxability, then this module scales by quantity, sums, and applies grocery tax
// to taxable lines. Items with no history still contribute a (low-confidence) line — never omitted.

import type { PriceEstimate, EstimateConfidence } from "@/services/PriceEstimationService";

export type OrderLineInput = {
  lineId?: string | null; // ShoppingListItem id, when estimating a persisted list
  displayName: string;
  quantity: number; // purchase units (default 1 upstream)
  taxable: boolean;
  estimate: PriceEstimate; // per single purchase unit
  sectionId?: string | null;
  sectionName?: string | null;
  sectionSort?: number | null;
};

export type OrderLineEstimate = {
  lineId: string | null;
  displayName: string;
  quantity: number;
  point: number;
  low: number;
  high: number;
  confidence: EstimateConfidence;
  basis: string;
  taxable: boolean;
  fromHistory: boolean; // backed by real observations (not a fallback guess)
  sectionId: string | null;
  sectionName: string;
  sectionSort: number;
};

export type OrderEstimate = {
  subtotal: { point: number; low: number; high: number };
  tax: { point: number; low: number; high: number };
  total: { point: number; low: number; high: number };
  lines: OrderLineEstimate[];
  fromHistoryCount: number;
  totalLines: number;
  summary: string; // e.g. "9 of 13 items based on real history"
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Total-order estimate (§8.2): scale each line by quantity, sum points/lows/highs into a subtotal,
 * add grocery tax (§8.3 — taxable lines only, flat rate), and report how many lines are backed by
 * real history. A line with no estimate basis still contributes its low-confidence amount.
 */
export function estimateOrder(lines: OrderLineInput[], taxRate: number): OrderEstimate {
  const lineEstimates: OrderLineEstimate[] = lines.map((l) => ({
    lineId: l.lineId ?? null,
    displayName: l.displayName,
    quantity: l.quantity,
    point: round2(l.estimate.point * l.quantity),
    low: round2(l.estimate.low * l.quantity),
    high: round2(l.estimate.high * l.quantity),
    confidence: l.estimate.confidence,
    basis: l.estimate.basis,
    taxable: l.taxable,
    fromHistory: l.estimate.observationCount > 0,
    sectionId: l.sectionId ?? null,
    sectionName: l.sectionName ?? "Other",
    sectionSort: l.sectionSort ?? 10000,
  }));

  const sum = (pick: (e: OrderLineEstimate) => number) =>
    round2(lineEstimates.reduce((t, e) => t + pick(e), 0));
  const sumTaxable = (pick: (e: OrderLineEstimate) => number) =>
    round2(lineEstimates.filter((e) => e.taxable).reduce((t, e) => t + pick(e), 0) * taxRate);

  const subtotal = { point: sum((e) => e.point), low: sum((e) => e.low), high: sum((e) => e.high) };
  const tax = {
    point: sumTaxable((e) => e.point),
    low: sumTaxable((e) => e.low),
    high: sumTaxable((e) => e.high),
  };
  const total = {
    point: round2(subtotal.point + tax.point),
    low: round2(subtotal.low + tax.low),
    high: round2(subtotal.high + tax.high),
  };

  const fromHistoryCount = lineEstimates.filter((e) => e.fromHistory).length;
  return {
    subtotal,
    tax,
    total,
    lines: lineEstimates,
    fromHistoryCount,
    totalLines: lineEstimates.length,
    summary: `${fromHistoryCount} of ${lineEstimates.length} items based on real history`,
  };
}
