import { prisma } from "@/lib/prisma";
import {
  buildSnapshotItem,
  tripTotals,
  checkedItemIds,
  type LiveListItem,
} from "@/services/TripCompletionService";
import { computeUnitPrice, selectObservation } from "@/services/PriceObservationService";

const SOURCE_LABELS: Record<string, string> = {
  weekly_staple: "Weekly Staples",
  restock: "Restock",
  pantry_review: "Pantry",
  manual: "Manual",
  recipe: "Recipe",
};

function dateOnly(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
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

  const liveItems: LiveListItem[] = list.items.map((it) => ({
    itemId: it.itemId,
    displayName: it.displayName,
    quantity: it.quantity,
    unit: it.unit,
    sectionName: it.section?.name ?? "Other / Unassigned",
    checked: it.checked,
    estimatedPrice: it.estimatedPrice != null ? Number(it.estimatedPrice) : null,
    paidPrice: it.paidPrice != null ? Number(it.paidPrice) : null,
    sourceLabels: [...new Set(it.sources.map(labelFor))],
  }));

  const totals = tripTotals(liveItems);
  const observedDate = dateOnly();

  // All mutations run in a single transaction so a mid-flight failure rolls back cleanly and
  // the next retry finds no snapshot (idempotency check above) and re-runs from scratch.
  return await prisma.$transaction(async (tx) => {
    const snapshot = await tx.tripSnapshot.create({
      data: {
        householdId: list.householdId,
        shoppingListId: list.id,
        weekStart: list.weekStart,
        completedAt: new Date(),
        storeName: `${list.store.brand} · ${list.store.name}`,
        totalEstimated: totals.totalEstimated,
        totalPaid: totals.totalPaid,
        itemCount: list.items.length,
        items: { create: liveItems.map(buildSnapshotItem) },
      },
    });

    // Price observations only for CHECKED items — unchecked items were not purchased (spec 6.13).
    for (const it of list.items) {
      if (!it.checked || !it.itemId) continue;
      const est = it.estimatedPrice != null ? Number(it.estimatedPrice) : null;
      const paid = it.paidPrice != null ? Number(it.paidPrice) : null;
      const obs = selectObservation(est, paid);
      if (!obs) continue;
      await tx.priceObservation.create({
        data: {
          itemId: it.itemId,
          storeId: list.storeId,
          amount: obs.amount,
          sourceType: obs.sourceType,
          observedDate,
          quantityBasis: it.quantity != null ? `${it.quantity} ${it.unit ?? ""}`.trim() : null,
          unitPrice: computeUnitPrice(obs.amount, it.quantity),
        },
      });
    }

    // Restock learns from real purchases (spec 6.13): bump last_purchased_date for checked items.
    const checked = checkedItemIds(liveItems);
    if (checked.length) {
      await tx.stapleRule.updateMany({
        where: { householdId: list.householdId, ruleType: "restock", itemId: { in: checked } },
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
      data: { status: "completed", completedAt: new Date() },
    });

    return snapshot.id;
  });
}
