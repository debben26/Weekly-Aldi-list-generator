import { prisma } from "@/lib/prisma";
import { windowStart } from "@/services/AnalyticsService";
import {
  estimateItemPrice,
  type ObservationPoint,
  type EstimateFallbacks,
} from "@/services/PriceEstimationService";
import {
  estimateOrder,
  type OrderLineInput,
  type OrderEstimate,
} from "@/services/OrderEstimationService";
import { DEFAULT_TAX_RATE } from "@/lib/constants";

// Total-order estimate DB layer (phase2-receipts-spec.md §8.2 / M4). Plain module (like match.ts):
// fetch the real paid observations for the list's store within the 6-month window, resolve each
// line's per-item estimate (§8.1) + taxability, then hand off to the pure OrderEstimationService.

// Only real PAID prices feed known/sparse estimates; estimated/seeded prices are a 0-obs fallback.
const REAL_PRICE_SOURCES = ["receipt", "manual"] as const;

export async function estimateListOrder(
  listId: string,
  now: Date = new Date(),
): Promise<OrderEstimate | null> {
  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    select: {
      storeId: true,
      items: {
        orderBy: { displayName: "asc" },
        select: {
          displayName: true,
          quantity: true,
          itemId: true,
          sectionId: true,
          item: { select: { taxable: true, defaultSectionId: true } },
        },
      },
    },
  });
  if (!list) return null;

  const since = windowStart(now);

  // Real paid observations for this store within the window, grouped by item.
  const observations = await prisma.priceObservation.findMany({
    where: {
      storeId: list.storeId,
      observedDate: { gte: since },
      sourceType: { in: [...REAL_PRICE_SOURCES] },
    },
    select: { itemId: true, unitPrice: true, observedDate: true },
  });
  const obsByItem = new Map<string, ObservationPoint[]>();
  for (const o of observations) {
    // The estimate is per single purchase unit, so only real per-unit prices feed it. An
    // observation without a unitPrice (e.g. a manual paid price recorded with unknown quantity)
    // carries a line total, not a per-unit price — folding it in would skew the median, so skip it.
    if (o.unitPrice == null) continue;
    const arr = obsByItem.get(o.itemId) ?? [];
    arr.push({ unitPrice: Number(o.unitPrice), observedDate: o.observedDate });
    obsByItem.set(o.itemId, arr);
  }

  // Seeded baselines (estimated source): most-recent value per item, used only when no real history.
  const baselines = await prisma.priceObservation.findMany({
    where: { storeId: list.storeId, sourceType: "estimated" },
    orderBy: { observedDate: "desc" },
    select: { itemId: true, unitPrice: true, amount: true },
  });
  const baselineByItem = new Map<string, number>();
  for (const b of baselines) {
    if (!baselineByItem.has(b.itemId)) baselineByItem.set(b.itemId, Number(b.unitPrice ?? b.amount));
  }

  // Section averages: mean of the point estimates of items that HAVE history, grouped by their
  // catalog section. Unknown items (no history) borrow their section's average (§8.1 fallback 1).
  const itemIdsWithObs = [...obsByItem.keys()];
  const meta = itemIdsWithObs.length
    ? await prisma.item.findMany({
        where: { id: { in: itemIdsWithObs } },
        select: { id: true, defaultSectionId: true },
      })
    : [];
  const sectionOfItem = new Map(meta.map((m) => [m.id, m.defaultSectionId]));
  const sectionPoints = new Map<string, number[]>();
  for (const [itemId, obs] of obsByItem) {
    const sectionId = sectionOfItem.get(itemId);
    if (!sectionId) continue;
    const pts = sectionPoints.get(sectionId) ?? [];
    pts.push(estimateItemPrice(obs).point);
    sectionPoints.set(sectionId, pts);
  }
  const sectionAvg = new Map<string, number>();
  for (const [sid, pts] of sectionPoints) {
    sectionAvg.set(sid, pts.reduce((a, b) => a + b, 0) / pts.length);
  }

  // Section names for the basis label — resolved by each item's CATALOG section (defaultSectionId),
  // the same key the section averages above are grouped under, so the label and the borrowed
  // average always agree. (ShoppingListItem.sectionId is the per-list placement and would not.)
  const sectionIds = [
    ...new Set(
      list.items
        .map((i) => i.item?.defaultSectionId)
        .filter((s): s is string => Boolean(s)),
    ),
  ];
  const sectionName = new Map(
    (sectionIds.length
      ? await prisma.storeSection.findMany({
          where: { id: { in: sectionIds } },
          select: { id: true, name: true },
        })
      : []
    ).map((s) => [s.id, s.name]),
  );

  const orderLines: OrderLineInput[] = list.items.map((li) => {
    const obs = li.itemId ? (obsByItem.get(li.itemId) ?? []) : [];
    // Borrow the section average / name by the item's catalog section — the key sectionAvg is keyed
    // by. Falling back to li.sectionId here would look up a key sectionAvg never holds (it is built
    // only from observed items' defaultSectionId), silently dropping a usable section average.
    const sectionId = li.item?.defaultSectionId ?? null;
    const fallbacks: EstimateFallbacks = {
      sectionName: sectionId ? (sectionName.get(sectionId) ?? null) : null,
      sectionAverage: sectionId ? (sectionAvg.get(sectionId) ?? null) : null,
      seededBaseline: li.itemId ? (baselineByItem.get(li.itemId) ?? null) : null,
    };
    return {
      displayName: li.displayName,
      quantity: li.quantity ?? 1,
      taxable: li.item?.taxable ?? false,
      estimate: estimateItemPrice(obs, fallbacks),
    };
  });

  return estimateOrder(orderLines, DEFAULT_TAX_RATE);
}
