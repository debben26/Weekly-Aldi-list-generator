import { prisma } from "@/lib/prisma";
import { SOURCE_LABELS } from "@/lib/constants";
import {
  buildSnapshotItem,
  tripTotals,
  type LiveListItem,
} from "@/services/TripCompletionService";
import { computeUnitPrice, priceObservations } from "@/services/PriceObservationService";
import { estimateListOrder } from "@/app/grocery-list/estimate";

function dateOnly(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

// Finalize a week (spec 6.13): freeze a denormalized TripSnapshot, record PriceObservations,
// update restock last_purchased_date for checked items, mark the week's meal plan completed,
// and close the list. Returns the snapshot id.
// Idempotent: if a snapshot already exists for this list (including partial-failure retries),
// return its id immediately without re-running any mutations.
export async function completeTrip(listId: string): Promise<string> {
  // Check upfront regardless of list status — handles the partial-failure retry case where
  // the snapshot was created but the list status update hadn't committed yet.
  const existingSnap = await prisma.tripSnapshot.findUnique({ where: { shoppingListId: listId } });
  if (existingSnap) return existingSnap.id;

  const list = await prisma.shoppingList.findUnique({
    where: { id: listId },
    include: { store: true, items: { include: { section: true, sources: true } } },
  });
  if (!list) throw new Error("Shopping list not found");

  // Source labels (incl. recipe titles) for the frozen snapshot — read outside the transaction.
  const recipeIds = [
    ...new Set(list.items.flatMap((i) => i.sources.map((s) => s.recipeId).filter(Boolean))),
  ] as string[];
  const recipeTitles = new Map(
    (
      await prisma.recipe.findMany({
        where: { id: { in: recipeIds } },
        select: { id: true, title: true },
      })
    ).map((r) => [r.id, r.title]),
  );
  const labelFor = (s: { recipeId: string | null; sourceType: string }) =>
    s.recipeId ? (recipeTitles.get(s.recipeId) ?? "Recipe") : SOURCE_LABELS[s.sourceType];

  // Per-line price estimates (§8.1/8.2), computed now so the frozen snapshot carries the
  // estimate the user shopped against. Line `point` is quantity-scaled — a line total, the
  // same basis as paidPrice. A stored estimatedPrice on the row (if one ever exists) wins.
  const orderEstimate = await estimateListOrder(listId);
  const estByLineId = new Map(
    (orderEstimate?.lines ?? [])
      .filter((l) => l.lineId != null)
      .map((l) => [l.lineId as string, { point: l.point, confidence: l.confidence }]),
  );

  const liveItems: LiveListItem[] = list.items.map((it) => ({
    itemId: it.itemId,
    displayName: it.displayName,
    quantity: it.quantity,
    unit: it.unit,
    sectionName: it.section?.name ?? "Other",
    checked: it.checked,
    estimatedPrice:
      it.estimatedPrice != null
        ? Number(it.estimatedPrice)
        : (estByLineId.get(it.id)?.point ?? null),
    paidPrice: it.paidPrice != null ? Number(it.paidPrice) : null,
    sourceLabels: [...new Set(it.sources.map(labelFor))],
  }));

  const totals = tripTotals(liveItems);
  // Single timestamp shared across the whole completion — snapshot and list use the same instant.
  const now = new Date();
  const observedDate = dateOnly(now);

  // All mutations run in a single transaction so a mid-flight failure rolls back cleanly and
  // the next retry finds no snapshot (idempotency check above) and re-runs from scratch.
  return await prisma.$transaction(async (tx) => {
    const snapshot = await tx.tripSnapshot.create({
      data: {
        householdId: list.householdId,
        shoppingListId: list.id,
        weekStart: list.weekStart,
        completedAt: now,
        storeName: `${list.store.brand} · ${list.store.name}`,
        totalEstimated: totals.totalEstimated,
        totalPaid: totals.totalPaid,
        itemCount: list.items.filter((i) => i.checked).length,
        items: { create: liveItems.map(buildSnapshotItem) },
      },
    });

    // Price observations only for CHECKED items — unchecked items were not purchased (spec 6.13).
    const priceObsData = [];
    for (const it of list.items) {
      if (!it.checked || !it.itemId) continue;
      // Stored row estimates are always recorded; computed estimates are recorded only when
      // history/override-backed (high/medium). A low-confidence fallback guess written as an
      // observation would feed the seeded-baseline fallback and ossify the guess.
      const stored = it.estimatedPrice != null ? Number(it.estimatedPrice) : null;
      const computed = estByLineId.get(it.id);
      const est =
        stored ?? (computed && computed.confidence !== "low" ? computed.point : null);
      const paid = it.paidPrice != null ? Number(it.paidPrice) : null;
      // Record estimated and paid as separate observations so price history keeps them
      // distinguishable (spec 6.15) — a line with both prices yields two rows.
      for (const obs of priceObservations(est, paid)) {
        priceObsData.push({
          itemId: it.itemId,
          storeId: list.storeId,
          amount: obs.amount,
          sourceType: obs.sourceType,
          observedDate,
          quantityBasis: it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : null,
          unitPrice: computeUnitPrice(obs.amount, it.quantity),
        });
      }
    }
    if (priceObsData.length) {
      await tx.priceObservation.createMany({ data: priceObsData });
    }

    // Restock last_purchased_date: only bump when the item was explicitly added as a Restock
    // source on this trip. Weekly-staple purchases must NOT update this — they would keep
    // daysSince perpetually small and suppress the restock signal for dual-role items.
    const restockChecked = liveItems
      .filter((it) => it.checked && it.itemId != null && it.sourceLabels.includes("Restock"))
      .map((it) => it.itemId as string);
    if (restockChecked.length) {
      await tx.stapleRule.updateMany({
        where: { householdId: list.householdId, ruleType: "restock", itemId: { in: restockChecked } },
        data: { lastPurchasedDate: observedDate, snoozedUntil: null },
      });
    }

    // Meal history: mark the week's plan(s) completed.
    await tx.mealPlan.updateMany({
      where: { householdId: list.householdId, weekStartDate: list.weekStart },
      data: { status: "completed" },
    });

    await tx.shoppingList.update({
      where: { id: list.id },
      data: { status: "completed", completedAt: now },
    });

    return snapshot.id;
  });
}
