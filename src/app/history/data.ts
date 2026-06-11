import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import { SOURCE_LABELS } from "@/lib/constants";
import {
  windowStart,
  aggregateSpendBySection,
  mealFrequency,
  purchaseFrequency,
} from "@/services/AnalyticsService";

// Source labels on a snapshot item that are NOT meals — everything else is a recipe title.
const NON_MEAL_LABELS = new Set(Object.values(SOURCE_LABELS));

// All analytics for the History page, scoped to the default 6-month window (spec 6.15).
export async function getAnalytics(now = new Date()) {
  const [household, store] = await Promise.all([getDefaultHousehold(), getDefaultStore()]);
  const since = windowStart(now);

  const [snapshots, observations] = await Promise.all([
    prisma.tripSnapshot.findMany({
      where: { householdId: household.id, weekStart: { gte: since } },
      include: { items: true },
      orderBy: { weekStart: "desc" },
    }),
    prisma.priceObservation.findMany({
      where: { storeId: store.id, observedDate: { gte: since } },
      include: { item: { select: { canonicalName: true } } },
      orderBy: { observedDate: "desc" },
    }),
  ]);

  const allItems = snapshots.flatMap((s) => s.items);

  const trips = snapshots.map((s) => ({
    id: s.id,
    weekStart: s.weekStart,
    completedAt: s.completedAt,
    storeName: s.storeName,
    itemCount: s.itemCount,
    totalPaid: s.totalPaid != null ? Number(s.totalPaid) : null,
    totalEstimated: s.totalEstimated != null ? Number(s.totalEstimated) : null,
  }));

  const totalPaid = trips.reduce((t, s) => t + (s.totalPaid ?? 0), 0);
  const totalEstimated = trips.reduce((t, s) => t + (s.totalEstimated ?? 0), 0);

  const spendBySection = aggregateSpendBySection(
    allItems.map((i) => ({
      sectionName: i.sectionName,
      paidPrice: i.paidPrice != null ? Number(i.paidPrice) : null,
    })),
  );

  const topItems = purchaseFrequency(
    allItems.map((i) => ({ itemId: i.itemId, displayName: i.displayName, checked: i.checked })),
  );

  // Most-selected meals, derived from frozen trips (not live meal-plan status) so the metric stays
  // consistent with the rest of History and resets when a trip is deleted. A meal counts once per
  // trip it appeared in; its recipe title is carried on snapshot-item sourceLabels.
  const mealOccurrences: { recipeId: string; title: string }[] = [];
  for (const snap of snapshots) {
    const titles = new Set<string>();
    for (const it of snap.items) {
      for (const label of it.sourceLabels) {
        if (!NON_MEAL_LABELS.has(label)) titles.add(label);
      }
    }
    for (const title of titles) mealOccurrences.push({ recipeId: title, title });
  }
  const meals = mealFrequency(mealOccurrences);

  // Price history grouped by item (estimated vs paid distinguishable via sourceType).
  const priceByItem = new Map<
    string,
    { name: string; points: { date: Date; amount: number; sourceType: string; unitPrice: number | null }[] }
  >();
  for (const o of observations) {
    const cur = priceByItem.get(o.itemId) ?? { name: o.item.canonicalName, points: [] };
    cur.points.push({
      date: o.observedDate,
      amount: Number(o.amount),
      sourceType: o.sourceType,
      unitPrice: o.unitPrice != null ? Number(o.unitPrice) : null,
    });
    priceByItem.set(o.itemId, cur);
  }
  const priceHistory = [...priceByItem.values()].sort((a, b) => a.name.localeCompare(b.name));

  return {
    since,
    trips,
    totalPaid,
    totalEstimated,
    spendBySection,
    topItems,
    meals,
    priceHistory,
  };
}
