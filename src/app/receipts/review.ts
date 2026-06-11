import { prisma } from "@/lib/prisma";
import { isUniqueViolation } from "@/lib/db-errors";
import { dimensionForPurchaseUnit } from "@/services/UnitService";
import { normalizeText } from "@/services/ItemMergeService";
import { recomputeImportStatus } from "@/app/receipts/match";
import { syncLineObservation } from "@/app/receipts/observations";
import { syncTripPaidData } from "@/app/receipts/trip-link";

// Review-queue core (phase2-receipts-spec.md §6.2 / M2). Plain module (like import.ts) so it is
// unit/integration testable; the "use server" actions in review-actions.ts are thin wrappers that
// add revalidatePath. Each operation resolves one line, runs the alias-learning loop where it
// applies, reconciles the receipt's import_status, and returns the receiptId for revalidation.

// Learning loop (§6.2): record this receipt's normalized line text as an alias on the matched item
// so the same Aldi abbreviation auto-matches next week. Skip the trivial case where the line already
// equals the item's canonical name (nothing new to learn), and ignore duplicate aliases.
async function learnAlias(itemId: string, normalizedName: string): Promise<void> {
  if (!normalizedName) return;
  const item = await prisma.item.findUnique({
    where: { id: itemId },
    select: { canonicalName: true },
  });
  if (!item) return;
  if (normalizeText(item.canonicalName) === normalizedName) return; // trivial, no alias needed

  try {
    await prisma.itemAlias.create({ data: { itemId, aliasText: normalizedName } });
  } catch (e) {
    if (!isUniqueViolation(e)) throw e; // alias already exists → fine
  }
}

// Confirm the suggested match OR change to a user-picked item — same op, different itemId source.
// User action is treated as certain → confidence 1; teaches an alias.
export async function setLineMatch(lineId: string, itemId: string): Promise<string> {
  const line = await prisma.receiptLineItem.update({
    where: { id: lineId },
    data: { matchedItemId: itemId, matchStatus: "confirmed", matchConfidence: 1 },
    select: { receiptId: true, normalizedName: true },
  });
  await learnAlias(itemId, line.normalizedName);
  await syncLineObservation(lineId); // M3: confirmed match → write/repoint the paid observation
  await syncTripPaidData(line.receiptId); // no-op unless the receipt is linked to a trip
  await recomputeImportStatus(line.receiptId);
  return line.receiptId;
}

export type NewItemFields = {
  canonicalName: string;
  purchaseUnit: string;
  defaultSectionId: string | null;
  food: boolean;
  aldiFriendly: boolean;
};

export type CreateItemForLineResult =
  | { ok: true; receiptId: string }
  | { ok: false; error: string };

// Create a brand-new item for this line, then attach + learn the alias. A duplicate canonical name
// is reported (like items/actions.ts:createItem) rather than thrown, so the review queue can show a
// friendly message and the user can pick the existing item via "Change" instead.
export async function createItemForLine(
  lineId: string,
  fields: NewItemFields,
): Promise<CreateItemForLineResult> {
  const line = await prisma.receiptLineItem.findUnique({
    where: { id: lineId },
    select: { receiptId: true, normalizedName: true },
  });
  if (!line) return { ok: false, error: "That receipt line no longer exists." };

  // Create the item and attach it to the line atomically: if the attach fails (e.g. the line was
  // deleted underneath us) the new item is rolled back rather than left orphaned in the catalog.
  let itemId: string;
  try {
    itemId = await prisma.$transaction(async (tx) => {
      const item = await tx.item.create({
        data: {
          canonicalName: fields.canonicalName,
          purchaseUnit: fields.purchaseUnit,
          dimension: dimensionForPurchaseUnit(fields.purchaseUnit),
          defaultSectionId: fields.defaultSectionId,
          food: fields.food,
          aldiFriendly: fields.aldiFriendly,
        },
        select: { id: true },
      });
      await tx.receiptLineItem.update({
        where: { id: lineId },
        data: { matchedItemId: item.id, matchStatus: "new_item", matchConfidence: 1 },
      });
      return item.id;
    });
  } catch (e) {
    if (isUniqueViolation(e)) {
      return {
        ok: false,
        error: `"${fields.canonicalName}" already exists — use Change to pick it instead.`,
      };
    }
    throw e;
  }

  await learnAlias(itemId, line.normalizedName);
  await syncLineObservation(lineId); // M3: new item → write the paid observation
  await syncTripPaidData(line.receiptId); // no-op unless the receipt is linked to a trip
  await recomputeImportStatus(line.receiptId);
  return { ok: true, receiptId: line.receiptId };
}

// Skip a line: no catalog item, no alias, no future price observation. Counts as resolved.
export async function skipLine(lineId: string): Promise<string> {
  const line = await prisma.receiptLineItem.update({
    where: { id: lineId },
    data: { matchedItemId: null, matchStatus: "unmatched", matchConfidence: null },
    select: { receiptId: true },
  });
  await syncLineObservation(lineId); // M3: skipped → remove any prior paid observation
  await syncTripPaidData(line.receiptId); // no-op unless the receipt is linked to a trip
  await recomputeImportStatus(line.receiptId);
  return line.receiptId;
}
