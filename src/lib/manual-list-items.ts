import { prisma } from "@/lib/prisma";
import { findOrCreateItem } from "@/lib/items";
import { num } from "@/lib/forms";

export type ManualListItemResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

// Shared one-off list add used by the wizard and final grocery list. A typed new item
// creates/reuses catalog data; a picked item keeps the list row linked for history/analytics.
export async function createManualListItem(formData: FormData): Promise<ManualListItemResult> {
  const listId = String(formData.get("listId") ?? "");
  if (!listId) return { ok: false, error: "Missing shopping list." };

  const newItemName = String(formData.get("newItemName") ?? "").trim();
  const pickedItemId = String(formData.get("itemId") ?? "");
  if (!newItemName && !pickedItemId) {
    return { ok: false, error: "Choose an item or add a new one." };
  }

  const itemId = newItemName ? await findOrCreateItem(newItemName) : pickedItemId;
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { id: true, canonicalName: true, purchaseUnit: true, defaultSectionId: true },
  });
  if (!item) return { ok: false, error: "Item not found." };

  const quantity = num(formData.get("quantity"));
  const unit = String(formData.get("unit") ?? "").trim() || item.purchaseUnit;
  const sectionId = String(formData.get("sectionId") ?? "") || item.defaultSectionId;

  const row = await prisma.shoppingListItem.create({
    data: {
      shoppingListId: listId,
      itemId: item.id,
      displayName: item.canonicalName,
      quantity,
      unit,
      sectionId,
      sourceSummary: "Manual",
      sources: { create: [{ sourceType: "manual", quantity, unit }] },
    },
    select: { id: true },
  });

  return { ok: true, id: row.id };
}
