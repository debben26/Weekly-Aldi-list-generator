"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultStore } from "@/lib/context";

function backWithError(message: string): never {
  redirect(`/history?error=${encodeURIComponent(message)}`);
}

// Match the date-only basis completeTrip used when writing observations (complete.ts).
function dateOnly(from: Date): Date {
  return new Date(from.getFullYear(), from.getMonth(), from.getDate());
}

// Fully remove a completed trip and free up its week (user-confirmed cleanup for duplicate/test
// trips). Deletes the frozen snapshot, the underlying shopping list, this completion's price
// observations, and reverts the week's meal plan(s) to draft so the week can be re-planned.
// completeTrip's lastPurchasedDate bump is intentionally not reverted (see plan) — restock cadence
// derives from the now-deleted snapshot items and self-corrects.
export async function deleteTrip(formData: FormData) {
  const snapshotId = String(formData.get("snapshotId") ?? "");
  if (!snapshotId) backWithError("No trip selected.");

  const snapshot = await prisma.tripSnapshot.findUnique({
    where: { id: snapshotId },
    select: {
      id: true,
      householdId: true,
      weekStart: true,
      completedAt: true,
      shoppingListId: true,
      shoppingList: { select: { id: true, storeId: true } },
      items: { select: { itemId: true } },
    },
  });
  if (!snapshot) backWithError("Trip not found.");

  const itemIds = [...new Set(snapshot.items.map((i) => i.itemId).filter(Boolean))] as string[];
  const storeId = snapshot.shoppingList?.storeId ?? (await getDefaultStore()).id;

  // Only revert the week's meal plans if this was the last trip for that week.
  const otherTrips = await prisma.tripSnapshot.count({
    where: { householdId: snapshot.householdId, weekStart: snapshot.weekStart, id: { not: snapshotId } },
  });

  await prisma.$transaction(async (tx) => {
    if (itemIds.length > 0) {
      await tx.priceObservation.deleteMany({
        where: {
          itemId: { in: itemIds },
          storeId,
          observedDate: dateOnly(snapshot.completedAt),
          sourceType: { in: ["estimated", "manual"] },
        },
      });
    }

    if (snapshot.shoppingListId) {
      await tx.shoppingList.delete({ where: { id: snapshot.shoppingListId } });
    }

    if (otherTrips === 0) {
      await tx.mealPlan.updateMany({
        where: {
          householdId: snapshot.householdId,
          weekStartDate: snapshot.weekStart,
          status: "completed",
        },
        data: { status: "draft" },
      });
    }

    await tx.tripSnapshot.delete({ where: { id: snapshotId } });
  });

  revalidatePath("/history");
  redirect("/history?deleted=1");
}
