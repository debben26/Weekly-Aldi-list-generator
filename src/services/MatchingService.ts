// MatchingService — receipt-line → catalog-item matching (phase2-receipts-spec.md §6.2 / §8.4,
// which reuses spec.md 8.1b). Pure and deterministic: no Prisma, no LLM, no network. The DB layer
// that loads candidates and writes results lives in src/app/receipts/match.ts.
//
// Scoring is the Dice coefficient over normalized token sets: 2·|A∩B| / (|A|+|B|). An exact match
// against a canonical name or a learned alias yields the same token set on both sides → 1.0. Aldi
// abbreviations ("shrd chdr chs" vs "shredded cheese") share no tokens → 0.0, so they fall to the
// review queue until the user confirms once and an alias is learned — after which they auto-match.

import { normalizeText } from "@/services/ItemMergeService";

export const AUTO_MATCH_THRESHOLD = 0.85;

export type MatchCandidate = {
  itemId: string;
  canonicalName: string; // raw; normalized here
  aliases: string[]; // already stored normalized; re-normalized defensively (idempotent)
};

export type MatchResult = {
  itemId: string | null;
  confidence: number; // 0–1
  via: "canonical" | "alias" | null;
};

function tokenSet(normalized: string): Set<string> {
  return new Set(normalized.split(/\s+/).filter(Boolean));
}

// Dice coefficient between two token sets. Both empty → 0 (no signal, not a match).
function dice(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const t of a) if (b.has(t)) intersection += 1;
  return (2 * intersection) / (a.size + b.size);
}

/**
 * Score a normalized receipt line against every candidate's canonical name and aliases, returning
 * the single best match. Deterministic tie-break: higher confidence wins; on equal confidence the
 * lexicographically-smaller canonicalName wins, so the same inputs always yield the same result.
 */
export function matchLine(
  normalizedReceiptName: string,
  candidates: MatchCandidate[],
): MatchResult {
  const receipt = tokenSet(normalizedReceiptName);
  if (receipt.size === 0) return { itemId: null, confidence: 0, via: null };

  let best: MatchResult = { itemId: null, confidence: 0, via: null };
  let bestName = "";

  for (const c of candidates) {
    const canonicalScore = dice(receipt, tokenSet(normalizeText(c.canonicalName)));
    let score = canonicalScore;
    let via: "canonical" | "alias" = "canonical";

    for (const alias of c.aliases) {
      const aliasScore = dice(receipt, tokenSet(normalizeText(alias)));
      if (aliasScore > score) {
        score = aliasScore;
        via = "alias";
      }
    }

    if (score === 0) continue;

    const better =
      score > best.confidence ||
      (score === best.confidence && c.canonicalName.localeCompare(bestName) < 0);
    if (better) {
      best = { itemId: c.itemId, confidence: score, via };
      bestName = c.canonicalName;
    }
  }

  return best;
}
