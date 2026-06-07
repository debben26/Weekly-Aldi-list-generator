import { describe, it, expect } from "vitest";
import {
  buildSnapshotItem,
  tripTotals,
  checkedItemIds,
  type LiveListItem,
} from "@/services/TripCompletionService";

function item(over: Partial<LiveListItem>): LiveListItem {
  return {
    itemId: "i1",
    displayName: "Milk (2%)",
    quantity: 1,
    unit: "gallon",
    sectionName: "Dairy",
    checked: true,
    estimatedPrice: null,
    paidPrice: null,
    sourceLabels: ["Weekly Staples"],
    ...over,
  };
}

describe("buildSnapshotItem (spec 5.6/10.3 — denormalized copy)", () => {
  it("copies display values and clones the labels array", () => {
    const live = item({});
    const snap = buildSnapshotItem(live);
    expect(snap.displayName).toBe("Milk (2%)");
    expect(snap.sourceLabels).toEqual(["Weekly Staples"]);
    expect(snap.sourceLabels).not.toBe(live.sourceLabels); // cloned, not referenced
  });

  it("is unaffected by later mutation of the live item (immutability at the value level)", () => {
    const live = item({});
    const snap = buildSnapshotItem(live);
    // simulate a later edit to the live item
    live.displayName = "Oat Milk";
    live.sourceLabels.push("Taco Bowls");
    live.paidPrice = 9.99;
    expect(snap.displayName).toBe("Milk (2%)");
    expect(snap.sourceLabels).toEqual(["Weekly Staples"]);
    expect(snap.paidPrice).toBeNull();
  });
});

describe("tripTotals", () => {
  it("sums estimated and paid separately, null when none present", () => {
    const totals = tripTotals([
      item({ estimatedPrice: 2, paidPrice: 3 }),
      item({ estimatedPrice: 1, paidPrice: null }),
    ]);
    expect(totals.totalEstimated).toBe(3);
    expect(totals.totalPaid).toBe(3);
  });

  it("returns null totals when no prices exist", () => {
    expect(tripTotals([item({})])).toEqual({ totalEstimated: null, totalPaid: null });
  });
});

describe("checkedItemIds", () => {
  it("returns item ids of checked rows only", () => {
    const ids = checkedItemIds([
      item({ itemId: "a", checked: true }),
      item({ itemId: "b", checked: false }),
      item({ itemId: null, checked: true }), // free-text, no id
    ]);
    expect(ids).toEqual(["a"]);
  });
});
