import { describe, it, expect } from "vitest";
import { matchLine, AUTO_MATCH_THRESHOLD, type MatchCandidate } from "@/services/MatchingService";
import { normalizeText } from "@/services/ItemMergeService";

// matchLine receives an already-normalized receipt name (the line's normalizedName); tests
// normalize their inputs the same way the importer does, to mirror reality.
const cand = (itemId: string, canonicalName: string, aliases: string[] = []): MatchCandidate => ({
  itemId,
  canonicalName,
  aliases,
});

const candidates: MatchCandidate[] = [
  cand("milk", "Whole Milk"),
  cand("cheese", "Shredded Cheese"),
  cand("banana", "Banana"),
];

describe("matchLine", () => {
  it("exact canonical match scores 1.0 (auto-match) via canonical", () => {
    const r = matchLine(normalizeText("Shredded Cheese"), candidates);
    expect(r).toEqual({ itemId: "cheese", confidence: 1, via: "canonical" });
    expect(r.confidence).toBeGreaterThanOrEqual(AUTO_MATCH_THRESHOLD);
  });

  it("exact alias match scores 1.0 via alias (the learning-loop payoff)", () => {
    const withAlias = [cand("cheese", "Shredded Cheese", ["shrd chdr chs"])];
    const r = matchLine(normalizeText("SHRD CHDR CHS"), withAlias);
    expect(r).toEqual({ itemId: "cheese", confidence: 1, via: "alias" });
  });

  it("singular/plural normalize to the same tokens (bananas → Banana = 1.0)", () => {
    const r = matchLine(normalizeText("BANANAS"), candidates);
    expect(r.itemId).toBe("banana");
    expect(r.confidence).toBe(1);
  });

  it("partial overlap scores below threshold → review (whole milk gal ≈ 0.80)", () => {
    const r = matchLine(normalizeText("WHOLE MILK GAL"), candidates);
    expect(r.itemId).toBe("milk");
    expect(r.confidence).toBeCloseTo(0.8, 5);
    expect(r.confidence).toBeLessThan(AUTO_MATCH_THRESHOLD);
  });

  it("abbreviation with no token overlap scores 0 → no suggestion", () => {
    const noAlias = [cand("cheese", "Shredded Cheese")];
    const r = matchLine(normalizeText("SHRD CHDR CHS"), noAlias);
    expect(r).toEqual({ itemId: null, confidence: 0, via: null });
  });

  it("no candidates → null match", () => {
    expect(matchLine(normalizeText("Milk"), [])).toEqual({
      itemId: null,
      confidence: 0,
      via: null,
    });
  });

  it("empty receipt name → null match", () => {
    expect(matchLine("", candidates)).toEqual({ itemId: null, confidence: 0, via: null });
  });

  it("tie-break is deterministic: equal scores pick the lexicographically smaller canonical", () => {
    const tied = [cand("z", "Zebra Cakes"), cand("a", "Apple Cakes")];
    // "cakes" overlaps both equally → tie → "Apple Cakes" (< "Zebra Cakes") wins.
    const r = matchLine(normalizeText("CAKES"), tied);
    expect(r.itemId).toBe("a");
  });
});
