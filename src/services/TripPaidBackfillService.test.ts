import { describe, it, expect } from "vitest";
import {
  paidByItem,
  buildPaidUpdates,
  type BackfillLine,
  type BackfillSnapshotItem,
} from "@/services/TripPaidBackfillService";

// Receipt → trip paid-price backfill: matched line totals are summed per item and applied to the
// trip's snapshot items as a FULL recompute (every item gets an update; no matched line → null).

const line = (
  matchedItemId: string | null,
  matchStatus: string,
  lineTotal: number,
): BackfillLine => ({ matchedItemId, matchStatus, lineTotal });

const snapItem = (id: string, itemId: string | null): BackfillSnapshotItem => ({ id, itemId });

describe("paidByItem", () => {
  it("sums line totals per matched item", () => {
    const sums = paidByItem([
      line("item-a", "confirmed", 3.0),
      line("item-a", "auto_matched", 2.0),
      line("item-b", "new_item", 4.5),
    ]);
    expect(sums.get("item-a")).toBeCloseTo(5.0);
    expect(sums.get("item-b")).toBeCloseTo(4.5);
  });

  it("excludes unresolved lines (needs_review suggestions, unmatched/skipped)", () => {
    const sums = paidByItem([
      line("item-a", "needs_review", 3.0), // suggestion only — not confirmed
      line(null, "unmatched", 2.0), // skipped
      line(null, "auto_matched", 1.0), // defensive: no item id
    ]);
    expect(sums.size).toBe(0);
  });
});

describe("buildPaidUpdates", () => {
  it("applies each item's sum to the first snapshot item; duplicates get null", () => {
    const updates = buildPaidUpdates(
      [line("item-a", "confirmed", 5.0)],
      [snapItem("s1", "item-a"), snapItem("s2", "item-a")],
    );
    expect(updates).toEqual([
      { snapshotItemId: "s1", paidPrice: 5.0 },
      { snapshotItemId: "s2", paidPrice: null },
    ]);
  });

  it("clears items the receipt has no matched line for (full recompute)", () => {
    const updates = buildPaidUpdates(
      [line("item-a", "confirmed", 5.0)],
      [snapItem("s1", "item-a"), snapItem("s2", "item-b"), snapItem("s3", null)], // s3 free-text
    );
    expect(updates).toEqual([
      { snapshotItemId: "s1", paidPrice: 5.0 },
      { snapshotItemId: "s2", paidPrice: null },
      { snapshotItemId: "s3", paidPrice: null },
    ]);
  });

  it("returns an empty list when the trip has no items", () => {
    expect(buildPaidUpdates([line("item-a", "confirmed", 5.0)], [])).toEqual([]);
  });
});
