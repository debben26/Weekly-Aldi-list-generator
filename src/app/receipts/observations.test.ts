import { describe, it, expect } from "vitest";
import { writesObservation } from "@/app/receipts/observations";

// Only a CONFIRMED match (auto_matched / confirmed / new_item) with an item is a real paid price
// (phase2-receipts-spec.md §6.3). A needs_review suggestion or an unmatched line writes nothing.
describe("writesObservation", () => {
  it("writes for auto_matched / confirmed / new_item lines that have an item", () => {
    expect(writesObservation("auto_matched", "item-1")).toBe(true);
    expect(writesObservation("confirmed", "item-1")).toBe(true);
    expect(writesObservation("new_item", "item-1")).toBe(true);
  });

  it("does not write for needs_review (a mere suggestion) or unmatched lines", () => {
    expect(writesObservation("needs_review", "item-1")).toBe(false); // suggestion, not confirmed
    expect(writesObservation("unmatched", null)).toBe(false);
  });

  it("never writes without a matched item, whatever the status", () => {
    expect(writesObservation("auto_matched", null)).toBe(false);
    expect(writesObservation("confirmed", null)).toBe(false);
  });
});
