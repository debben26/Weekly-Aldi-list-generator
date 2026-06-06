import { describe, it, expect } from "vitest";
import {
  evaluateRestock,
  computeEffectiveInterval,
  median,
  compareSuggestions,
  type RestockInput,
  type RestockEvaluation,
} from "@/services/RestockSuggestionService";

const TODAY = new Date(2026, 5, 1); // June 1, 2026
const daysAgo = (n: number) => new Date(TODAY.getTime() - n * 86_400_000);
const daysAhead = (n: number) => new Date(TODAY.getTime() + n * 86_400_000);

function evalWith(overrides: Partial<RestockInput>): RestockEvaluation {
  return evaluateRestock({
    today: TODAY,
    lastPurchasedDate: null,
    expectedIntervalDays: null,
    snoozedUntil: null,
    purchaseDates: [],
    ...overrides,
  });
}

describe("median", () => {
  it("handles odd and even counts", () => {
    expect(median([42, 40, 44])).toBe(42);
    expect(median([40, 44])).toBe(42);
  });
});

describe("ratio thresholds (spec 8.2 step 4 — must pass)", () => {
  it("ratio 0.8 -> maybe_due", () => {
    expect(evalWith({ expectedIntervalDays: 100, lastPurchasedDate: daysAgo(80) }).state).toBe(
      "maybe_due",
    );
  });
  it("ratio 0.999 -> maybe_due", () => {
    expect(
      evalWith({ expectedIntervalDays: 1000, lastPurchasedDate: daysAgo(999) }).state,
    ).toBe("maybe_due");
  });
  it("ratio 1.0 -> due", () => {
    expect(evalWith({ expectedIntervalDays: 100, lastPurchasedDate: daysAgo(100) }).state).toBe(
      "due",
    );
  });
  it("ratio 0.79 -> not_due", () => {
    expect(evalWith({ expectedIntervalDays: 100, lastPurchasedDate: daysAgo(79) }).state).toBe(
      "not_due",
    );
  });
});

describe("due detection", () => {
  it("is due from a manual interval", () => {
    const e = evalWith({ expectedIntervalDays: 30, lastPurchasedDate: daysAgo(45) });
    expect(e.state).toBe("due");
    expect(e.cadenceSource).toBe("manual");
    expect(e.reason).toContain("Manual interval every 30 days");
  });

  it("is due from purchase history (>= 3 obs, learned cadence)", () => {
    const e = evalWith({
      purchaseDates: [daysAgo(129), daysAgo(87), daysAgo(45)], // gaps 42, 42
      lastPurchasedDate: daysAgo(45),
    });
    expect(e.cadenceSource).toBe("learned");
    expect(e.effectiveIntervalDays).toBe(42);
    expect(e.state).toBe("due"); // 45 / 42 >= 1
    expect(e.reason).toContain("Usually purchased every 42 days");
  });

  it("treats a configured item never purchased as due", () => {
    const e = evalWith({ expectedIntervalDays: 30, lastPurchasedDate: null });
    expect(e.state).toBe("due");
    expect(e.reason).toContain("never recorded as purchased");
  });
});

describe("cold start (spec 8.2 / Section 12 — must pass)", () => {
  it("falls back to manual interval when < 3 prior purchases", () => {
    const e = evalWith({
      purchaseDates: [daysAgo(60), daysAgo(31)], // only 2 obs -> no learned cadence
      expectedIntervalDays: 30,
      lastPurchasedDate: daysAgo(31),
    });
    expect(e.cadenceSource).toBe("manual");
    expect(e.state).toBe("due");
  });

  it("is no_cadence (not suggested) with no interval and < 3 purchases", () => {
    const e = evalWith({ purchaseDates: [daysAgo(20)], expectedIntervalDays: null });
    expect(e.state).toBe("no_cadence");
    expect(e.effectiveIntervalDays).toBeNull();
  });
});

describe("snooze (spec 8.2 step 1 — must pass)", () => {
  it("is hidden (snoozed) while the snooze date is in the future", () => {
    const e = evalWith({
      expectedIntervalDays: 30,
      lastPurchasedDate: daysAgo(45), // would otherwise be due
      snoozedUntil: daysAhead(7),
    });
    expect(e.state).toBe("snoozed");
  });

  it("resumes normal evaluation once the snooze date has passed", () => {
    const e = evalWith({
      expectedIntervalDays: 30,
      lastPurchasedDate: daysAgo(45),
      snoozedUntil: daysAgo(1),
    });
    expect(e.state).toBe("due");
  });
});

describe("confidence (spec 8.2 step 5)", () => {
  it("high when learned from >= 5 observations", () => {
    const e = evalWith({
      purchaseDates: [daysAgo(120), daysAgo(90), daysAgo(60), daysAgo(30), daysAgo(1)],
      lastPurchasedDate: daysAgo(1),
    });
    expect(e.cadenceSource).toBe("learned");
    expect(e.confidence).toBe("high");
  });

  it("medium when learned from 3-4 observations", () => {
    const e = evalWith({
      purchaseDates: [daysAgo(90), daysAgo(60), daysAgo(30)],
      lastPurchasedDate: daysAgo(30),
    });
    expect(e.confidence).toBe("medium");
  });

  it("medium for a manual interval", () => {
    expect(evalWith({ expectedIntervalDays: 30, lastPurchasedDate: daysAgo(10) }).confidence).toBe(
      "medium",
    );
  });

  it("low when there is no cadence", () => {
    expect(evalWith({}).confidence).toBe("low");
  });
});

describe("determinism", () => {
  it("same input -> same output", () => {
    const input: RestockInput = {
      today: TODAY,
      lastPurchasedDate: daysAgo(45),
      expectedIntervalDays: 30,
      snoozedUntil: null,
      purchaseDates: [],
    };
    expect(evaluateRestock(input)).toEqual(evaluateRestock(input));
  });
});

describe("computeEffectiveInterval", () => {
  it("prefers learned cadence over a configured manual interval", () => {
    const r = computeEffectiveInterval({
      purchaseDates: [daysAgo(90), daysAgo(60), daysAgo(30)], // gaps 30, 30
      expectedIntervalDays: 7,
    });
    expect(r.source).toBe("learned");
    expect(r.intervalDays).toBe(30);
  });
});

describe("compareSuggestions ordering (spec 8.2 step 7)", () => {
  it("orders due before maybe_due before others", () => {
    const mk = (state: RestockEvaluation["state"], sectionSortOrder = 0) => ({
      evaluation: { state, confidence: "medium" } as RestockEvaluation,
      sectionSortOrder,
    });
    const list = [mk("not_due"), mk("due"), mk("maybe_due")];
    list.sort(compareSuggestions);
    expect(list.map((x) => x.evaluation.state)).toEqual(["due", "maybe_due", "not_due"]);
  });
});
