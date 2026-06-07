import { prisma } from "@/lib/prisma";
import {
  matchLine,
  AUTO_MATCH_THRESHOLD,
  type MatchCandidate,
} from "@/services/MatchingService";

// Receipt matching DB layer (phase2-receipts-spec.md §6.2 / M2). Plain module (like import.ts) so
// it is unit/integration testable. Loads catalog candidates, runs the pure MatchingService scorer
// per line, and writes match_status / matched_item_id / match_confidence back to each line.

export async function loadCandidates(): Promise<MatchCandidate[]> {
  const items = await prisma.item.findMany({
    where: { active: true },
    select: { id: true, canonicalName: true, aliases: { select: { aliasText: true } } },
  });
  return items.map((i) => ({
    itemId: i.id,
    canonicalName: i.canonicalName,
    aliases: i.aliases.map((a) => a.aliasText),
  }));
}

/**
 * Match every line on a receipt against the catalog and persist the result.
 * - confidence ≥ 0.85 → auto_matched (matched item recorded).
 * - confidence in (0, 0.85) → needs_review, with the best suggestion kept in matched_item_id.
 * - confidence 0 → needs_review with no suggestion (matched_item_id cleared).
 * Then reconcile the receipt's import_status.
 */
export async function applyMatching(receiptId: string): Promise<void> {
  const lines = await prisma.receiptLineItem.findMany({
    where: { receiptId },
    select: { id: true, normalizedName: true },
  });
  const candidates = await loadCandidates();

  for (const line of lines) {
    const result = matchLine(line.normalizedName, candidates);
    const autoMatched = result.itemId !== null && result.confidence >= AUTO_MATCH_THRESHOLD;
    await prisma.receiptLineItem.update({
      where: { id: line.id },
      data: {
        matchedItemId: result.itemId, // null when no token overlap
        matchConfidence: result.itemId ? result.confidence : null,
        matchStatus: autoMatched ? "auto_matched" : "needs_review",
      },
    });
  }

  await recomputeImportStatus(receiptId);
}

/**
 * A receipt is `completed` once no line is still `needs_review` (spec §6.2); auto_matched,
 * confirmed, new_item and unmatched (user-skipped) all count as resolved. Exported for reuse by the
 * per-line review actions.
 */
export async function recomputeImportStatus(receiptId: string): Promise<void> {
  const pending = await prisma.receiptLineItem.count({
    where: { receiptId, matchStatus: "needs_review" },
  });
  await prisma.receipt.update({
    where: { id: receiptId },
    data: { importStatus: pending === 0 ? "completed" : "pending_review" },
  });
}
