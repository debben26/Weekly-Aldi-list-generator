import { prisma } from "@/lib/prisma";

// Add a restock rule's item to a list (spec 6.4: one-action add).
// If the item is already on the list (e.g. as a weekly staple or recipe ingredient), DON'T skip:
// append a `restock` source so the row's provenance records the restock decision (spec 6.10/6.11).
// Quantity is left unchanged — we only add provenance. This is what lets a dual-role item's
// completed snapshot carry a "Restock" label, which feeds restock cadence learning (8.2) and the
// last_purchased_date bump on completion. Idempotent: a row that already has a restock source is
// left untouched.
export async function addRestock(listId: string, ruleId: string): Promise<void> {
  const rule = await prisma.stapleRule.findUnique({ where: { id: ruleId }, include: { item: true } });
  if (!rule) throw new Error("Restock rule not found");

  const existing = await prisma.shoppingListItem.findFirst({
    where: { shoppingListId: listId, itemId: rule.itemId },
    include: { sources: true },
  });

  if (existing) {
    if (existing.sources.some((s) => s.sourceType === "restock")) return; // already has restock provenance
    const labels = (existing.sourceSummary ?? "").split(" + ").filter(Boolean);
    if (!labels.includes("Restock")) labels.push("Restock");
    await prisma.shoppingListItem.update({
      where: { id: existing.id },
      data: {
        sourceSummary: labels.join(" + "),
        sources: {
          create: [{ sourceType: "restock", quantity: rule.defaultQuantity, unit: rule.defaultUnit ?? rule.item.purchaseUnit }],
        },
      },
    });
    return;
  }

  await prisma.shoppingListItem.create({
    data: {
      shoppingListId: listId,
      itemId: rule.itemId,
      displayName: rule.item.canonicalName,
      quantity: rule.defaultQuantity,
      unit: rule.defaultUnit ?? rule.item.purchaseUnit,
      sectionId: rule.defaultSectionId ?? rule.item.defaultSectionId,
      sourceSummary: "Restock",
      sources: {
        create: [{ sourceType: "restock", quantity: rule.defaultQuantity, unit: rule.defaultUnit ?? rule.item.purchaseUnit }],
      },
    },
  });
}
