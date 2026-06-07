"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { generateFromMealPlan } from "./generate";
import { completeTrip } from "./complete";
import { addRestock } from "./restock";

function num(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export async function generateList(formData: FormData) {
  const mealPlanId = String(formData.get("mealPlanId") ?? "");
  if (!mealPlanId) redirect(`/grocery-list?error=${encodeURIComponent("Choose a meal plan.")}`);
  // pantryOverride fields carry item ids the user has explicitly opted to include despite
  // their pantry status being "have" (spec 8.1 step 5 / 6.6 user override).
  const overrideIds = formData.getAll("pantryOverride").map(String).filter(Boolean);
  const listId = await generateFromMealPlan(mealPlanId, new Set(overrideIds));
  redirect(`/grocery-list/${listId}`);
}

export async function finalizeTrip(formData: FormData) {
  const listId = String(formData.get("listId") ?? "");
  const snapshotId = await completeTrip(listId);
  redirect(`/history?completed=${snapshotId}`);
}

export async function updateListItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const listId = String(formData.get("listId") ?? "");
  await prisma.shoppingListItem.update({
    where: { id },
    data: {
      quantity: num(formData.get("quantity")),
      unit: String(formData.get("unit") ?? "").trim() || null,
      sectionId: String(formData.get("sectionId") ?? "") || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      estimatedPrice: num(formData.get("estimatedPrice")),
      paidPrice: num(formData.get("paidPrice")),
    },
  });
  revalidatePath(`/grocery-list/${listId}`);
}

export async function toggleChecked(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const listId = String(formData.get("listId") ?? "");
  const checked = String(formData.get("checked") ?? "") === "true";
  await prisma.shoppingListItem.update({ where: { id }, data: { checked } });
  revalidatePath(`/grocery-list/${listId}`);
}

export async function removeListItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const listId = String(formData.get("listId") ?? "");
  await prisma.shoppingListItem.delete({ where: { id } });
  revalidatePath(`/grocery-list/${listId}`);
}

export async function addManualItem(formData: FormData) {
  const listId = String(formData.get("listId") ?? "");
  const displayName = String(formData.get("displayName") ?? "").trim();
  if (!displayName) {
    redirect(`/grocery-list/${listId}?error=${encodeURIComponent("Item name is required.")}`);
  }
  await prisma.shoppingListItem.create({
    data: {
      shoppingListId: listId,
      displayName,
      quantity: num(formData.get("quantity")),
      unit: String(formData.get("unit") ?? "").trim() || null,
      sectionId: String(formData.get("sectionId") ?? "") || null,
      sourceSummary: "Manual",
      sources: { create: [{ sourceType: "manual", quantity: num(formData.get("quantity")), unit: String(formData.get("unit") ?? "").trim() || null }] },
    },
  });
  revalidatePath(`/grocery-list/${listId}`);
}

// Add a restock rule's item to the list (spec 6.4: one-action add). See `addRestock` for the
// provenance-preserving behavior when the item is already on the list.
export async function addRestockToList(formData: FormData) {
  const listId = String(formData.get("listId") ?? "");
  const ruleId = String(formData.get("ruleId") ?? "");
  await addRestock(listId, ruleId);
  revalidatePath(`/grocery-list/${listId}`);
}
