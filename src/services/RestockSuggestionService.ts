// RestockSuggestionService — deterministic restock engine (spec 8.2).
// Pure functions only (no DB, no clock) so the boundary cases are exhaustively testable and
// "same input -> same output". The DB loader that feeds these lives in the staples data layer.

import {
  RESTOCK_DUE_RATIO,
  RESTOCK_MAYBE_DUE_RATIO,
  MIN_PURCHASES_FOR_LEARNED_CADENCE,
  HIGH_CONFIDENCE_MIN_OBS,
} from "@/lib/constants";

export type RestockState = "due" | "maybe_due" | "not_due" | "snoozed" | "no_cadence";
export type CadenceSource = "learned" | "manual" | "none";
export type Confidence = "high" | "medium" | "low";

export type RestockInput = {
  today: Date;
  lastPurchasedDate: Date | null;
  expectedIntervalDays: number | null;
  snoozedUntil: Date | null;
  /** Prior purchase dates (any order). Learned cadence needs >= 3. */
  purchaseDates: Date[];
};

export type RestockEvaluation = {
  state: RestockState;
  cadenceSource: CadenceSource;
  effectiveIntervalDays: number | null;
  daysSince: number | null;
  ratio: number | null;
  confidence: Confidence;
  reason: string;
};

const MS_PER_DAY = 86_400_000;

export function daysBetween(a: Date, b: Date): number {
  return Math.floor((a.getTime() - b.getTime()) / MS_PER_DAY);
}

export function median(values: number[]): number {
  const sorted = [...values].sort((x, y) => x - y);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/**
 * Determine the effective interval (spec 8.2 step 2): prefer learned cadence (median of
 * day-gaps) iff >= 3 prior purchases; else the manual interval; else none.
 */
export function computeEffectiveInterval(input: {
  purchaseDates: Date[];
  expectedIntervalDays: number | null;
}): { intervalDays: number | null; source: CadenceSource; obsCount: number } {
  const obsCount = input.purchaseDates.length;

  if (obsCount >= MIN_PURCHASES_FOR_LEARNED_CADENCE) {
    const sorted = [...input.purchaseDates].sort((a, b) => a.getTime() - b.getTime());
    const gaps: number[] = [];
    for (let i = 1; i < sorted.length; i++) gaps.push(daysBetween(sorted[i], sorted[i - 1]));
    if (gaps.length > 0) {
      return { intervalDays: median(gaps), source: "learned", obsCount };
    }
  }

  if (input.expectedIntervalDays != null && input.expectedIntervalDays > 0) {
    return { intervalDays: input.expectedIntervalDays, source: "manual", obsCount };
  }

  return { intervalDays: null, source: "none", obsCount };
}

function confidenceFor(source: CadenceSource, obsCount: number): Confidence {
  if (source === "learned") return obsCount >= HIGH_CONFIDENCE_MIN_OBS ? "high" : "medium";
  if (source === "manual") return "medium";
  return "low";
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/**
 * Evaluate a single restock rule (spec 8.2). Deterministic: depends only on its inputs.
 */
export function evaluateRestock(input: RestockInput): RestockEvaluation {
  const { intervalDays, source, obsCount } = computeEffectiveInterval(input);
  const confidence = confidenceFor(source, obsCount);

  // Step 1: snooze overrides everything.
  if (input.snoozedUntil && input.snoozedUntil.getTime() > input.today.getTime()) {
    return {
      state: "snoozed",
      cadenceSource: source,
      effectiveIntervalDays: intervalDays,
      daysSince: null,
      ratio: null,
      confidence,
      reason: `Snoozed until ${fmtDate(input.snoozedUntil)}.`,
    };
  }

  // Step 2: no cadence -> do not suggest.
  if (intervalDays == null) {
    return {
      state: "no_cadence",
      cadenceSource: "none",
      effectiveIntervalDays: null,
      daysSince: null,
      ratio: null,
      confidence: "low",
      reason: "No cadence yet — set an interval or record a few purchases.",
    };
  }

  const intervalLabel =
    source === "learned"
      ? `Usually purchased every ${Math.round(intervalDays)} days`
      : `Manual interval every ${Math.round(intervalDays)} days`;

  // Step 3: never recorded as purchased but an interval exists -> treat as due.
  if (input.lastPurchasedDate == null) {
    return {
      state: "due",
      cadenceSource: source,
      effectiveIntervalDays: intervalDays,
      daysSince: null,
      ratio: null,
      confidence,
      reason: `${intervalLabel}; never recorded as purchased.`,
    };
  }

  const daysSince = daysBetween(input.today, input.lastPurchasedDate);
  const ratio = daysSince / intervalDays;

  let state: RestockState;
  if (ratio >= RESTOCK_DUE_RATIO) state = "due";
  else if (ratio >= RESTOCK_MAYBE_DUE_RATIO) state = "maybe_due";
  else state = "not_due";

  return {
    state,
    cadenceSource: source,
    effectiveIntervalDays: intervalDays,
    daysSince,
    ratio,
    confidence,
    reason: `${intervalLabel}; last purchased ${daysSince} days ago.`,
  };
}

// Ordering for the restock review (spec 8.2 step 7): due first, then maybe_due, then the rest;
// ties broken by confidence then section route order.
const STATE_RANK: Record<RestockState, number> = {
  due: 0,
  maybe_due: 1,
  not_due: 2,
  no_cadence: 3,
  snoozed: 4,
};
const CONFIDENCE_RANK: Record<Confidence, number> = { high: 0, medium: 1, low: 2 };

export function compareSuggestions(
  a: { evaluation: RestockEvaluation; sectionSortOrder: number },
  b: { evaluation: RestockEvaluation; sectionSortOrder: number },
): number {
  const byState = STATE_RANK[a.evaluation.state] - STATE_RANK[b.evaluation.state];
  if (byState !== 0) return byState;
  const byConf =
    CONFIDENCE_RANK[a.evaluation.confidence] - CONFIDENCE_RANK[b.evaluation.confidence];
  if (byConf !== 0) return byConf;
  return a.sectionSortOrder - b.sectionSortOrder;
}
