"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { dimensionForPurchaseUnit } from "@/services/UnitService";
import { normalizeText } from "@/services/ItemMergeService";

export type ItemFormState = { error?: string };

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";
}

// Parse the shared Item fields out of the form (spec 6.2 + 5.3a). dimension is derived from
// the purchase unit, never entered by hand.
function parseItemFields(formData: FormData) {
  const canonicalName = String(formData.get("canonicalName") ?? "").trim();
  const purchaseUnit = String(formData.get("purchaseUnit") ?? "").trim();
  const sizeRaw = String(formData.get("purchaseUnitSize") ?? "").trim();
  const purchaseUnitSize = sizeRaw === "" ? null : Number(sizeRaw);
  const defaultSectionId = String(formData.get("defaultSectionId") ?? "") || null;

  return {
    canonicalName,
    purchaseUnit,
    purchaseUnitSize:
      purchaseUnitSize !== null && Number.isFinite(purchaseUnitSize)
        ? purchaseUnitSize
        : null,
    purchaseUnitSizeUnit: String(formData.get("purchaseUnitSizeUnit") ?? "").trim() || null,
    defaultSectionId,
    dimension: dimensionForPurchaseUnit(purchaseUnit),
    food: formData.get("food") === "on",
    aldiFriendly: formData.get("aldiFriendly") === "on",
    variant: String(formData.get("variant") ?? "").trim() || null,
    size: String(formData.get("size") ?? "").trim() || null,
    notes: String(formData.get("notes") ?? "").trim() || null,
  };
}

export async function createItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const data = parseItemFields(formData);
  if (!data.canonicalName) return { error: "Item name is required." };
  if (!data.purchaseUnit) return { error: "Purchase unit is required." };

  try {
    await prisma.item.create({ data });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `"${data.canonicalName}" already exists.` };
    throw e;
  }
  revalidatePath("/items");
  redirect("/items");
}

export async function updateItem(
  _prev: ItemFormState,
  formData: FormData,
): Promise<ItemFormState> {
  const id = String(formData.get("id") ?? "");
  const data = parseItemFields(formData);
  if (!id) return { error: "Missing item id." };
  if (!data.canonicalName) return { error: "Item name is required." };
  if (!data.purchaseUnit) return { error: "Purchase unit is required." };

  try {
    await prisma.item.update({ where: { id }, data });
  } catch (e) {
    if (isUniqueViolation(e)) return { error: `"${data.canonicalName}" already exists.` };
    throw e;
  }
  revalidatePath("/items");
  redirect("/items");
}

// Soft-delete / reactivate (spec 10.3: active flags for reusable config; never hard-delete).
export async function setItemActive(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await prisma.item.update({ where: { id }, data: { active } });
  revalidatePath("/items");
  redirect("/items");
}

export async function addAlias(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  const aliasText = normalizeText(String(formData.get("aliasText") ?? ""));
  if (!aliasText) redirect(`/items/${itemId}?error=${encodeURIComponent("Alias is empty.")}`);

  try {
    await prisma.itemAlias.create({ data: { itemId, aliasText } });
  } catch (e) {
    if (isUniqueViolation(e)) {
      redirect(`/items/${itemId}?error=${encodeURIComponent(`Alias "${aliasText}" already exists.`)}`);
    }
    throw e;
  }
  revalidatePath(`/items/${itemId}`);
}

export async function removeAlias(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  await prisma.itemAlias.delete({ where: { id } });
  revalidatePath(`/items/${itemId}`);
}
