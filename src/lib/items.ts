import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/db-errors";
import { dimensionForPurchaseUnit } from "@/services/UnitService";

const DEFAULT_PURCHASE_UNIT = "each";

// Resolve a free-text item name to a catalog Item id, creating a minimal Item (name + default
// purchase unit) when no active match exists. Lets users add items inline (recipes / staples)
// without pre-creating them in /items; details can be refined there later. Returns the item id.
export async function findOrCreateItem(rawName: string): Promise<string> {
  const name = rawName.trim();
  if (!name) throw new Error("Item name is required.");

  const existing = await prisma.item.findFirst({
    where: { canonicalName: { equals: name, mode: "insensitive" } },
    select: { id: true },
  });
  if (existing) return existing.id;

  try {
    const created = await prisma.item.create({
      data: {
        canonicalName: name,
        purchaseUnit: DEFAULT_PURCHASE_UNIT,
        dimension: dimensionForPurchaseUnit(DEFAULT_PURCHASE_UNIT),
      },
      select: { id: true },
    });
    return created.id;
  } catch (e) {
    // Unique race: a concurrent create won — re-query and reuse it.
    if (isUniqueViolation(e)) {
      const again = await prisma.item.findFirst({
        where: { canonicalName: { equals: name, mode: "insensitive" } },
        select: { id: true },
      });
      if (again) return again.id;
    }
    throw e;
  }
}
