import { prisma } from "@/lib/prisma";
import { getDefaultHousehold, getDefaultStore } from "@/lib/context";
import {
  windowStart,
  aggregateSpendBySection,
  mealFrequency,
  purchaseFrequency,
} from "@/services/AnalyticsService";

// All analytics for the History page, scoped to the default 6-month window (spec 6.15).
export async function getAnalytics(now = new Date()) {
  const [household, store] = await Promise.all([getDefaultHousehold(), getDefaultStore()]);
  const since = windowStart(now);

  const [snapshots, observations, mealEntries] = await Promise.all([
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
    prisma.mealPlanEntry.findMany({
      where: {
        mealPlan: { householdId: household.id, status: "completed", weekStartDate: { gte: since } },
      },
      include: { recipe: { select: { title: true } } },
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

  const meals = mealFrequency(
    mealEntries.map((e) => ({ recipeId: e.recipeId, title: e.recipe.title })),
  );

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
