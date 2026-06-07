import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import {
  evaluateRestock,
  compareSuggestions,
  type RestockEvaluation,
} from "@/services/RestockSuggestionService";

export type RestockSuggestion = {
  rule: {
    id: string;
    itemId: string;
    itemName: string;
    defaultQuantity: number | null;
    defaultUnit: string | null;
    sectionName: string | null;
    expectedIntervalDays: number | null;
    lastPurchasedDate: Date | null;
    snoozedUntil: Date | null;
  };
  evaluation: RestockEvaluation;
  sectionSortOrder: number;
};

// Loads active restock rules, derives each item's purchase history from frozen trips
// (none until M6 -> cold start), runs the deterministic engine (8.2), and ranks the results.
export async function getRestockSuggestions(today = new Date()): Promise<RestockSuggestion[]> {
  const household = await getDefaultHousehold();
  const rules = await prisma.stapleRule.findMany({
    where: { householdId: household.id, ruleType: "restock", active: true },
    include: { item: { include: { defaultSection: true } }, defaultSection: true },
  });

  // Purchase history for all restock items in one query (frozen trip lines).
  const itemIds = rules.map((r) => r.itemId);
  const snaps = itemIds.length
    ? await prisma.tripSnapshotItem.findMany({
        where: { itemId: { in: itemIds }, checked: true },
        include: { tripSnapshot: { select: { completedAt: true } } },
      })
    : [];
  const historyByItem = new Map<string, Date[]>();
  for (const s of snaps) {
    if (!s.itemId) continue;
    const list = historyByItem.get(s.itemId) ?? [];
    list.push(s.tripSnapshot.completedAt);
    historyByItem.set(s.itemId, list);
  }

  const suggestions: RestockSuggestion[] = rules.map((r) => {
    const evaluation = evaluateRestock({
      today,
      lastPurchasedDate: r.lastPurchasedDate,
      expectedIntervalDays: r.expectedIntervalDays,
      snoozedUntil: r.snoozedUntil,
      purchaseDates: historyByItem.get(r.itemId) ?? [],
    });
    const section = r.defaultSection ?? r.item.defaultSection;
    return {
      rule: {
        id: r.id,
        itemId: r.itemId,
        itemName: r.item.canonicalName,
        defaultQuantity: r.defaultQuantity,
        defaultUnit: r.defaultUnit,
        sectionName: section?.name ?? null,
        expectedIntervalDays: r.expectedIntervalDays,
        lastPurchasedDate: r.lastPurchasedDate,
        snoozedUntil: r.snoozedUntil,
      },
      evaluation,
      sectionSortOrder: section?.sortOrder ?? Number.MAX_SAFE_INTEGER,
    };
  });

  suggestions.sort(compareSuggestions);
  return suggestions;
}
