"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";

const STATUSES = ["have", "low", "out", "unknown"] as const;
type PantryStatus = (typeof STATUSES)[number];

function backWithError(message: string): never {
  redirect(`/pantry?error=${encodeURIComponent(message)}`);
}

export async function setPantryStatus(formData: FormData) {
  const itemId = String(formData.get("itemId") ?? "");
  const status = String(formData.get("status") ?? "") as PantryStatus;
  if (!itemId) backWithError("Choose an item.");
  if (!STATUSES.includes(status)) backWithError("Invalid status.");

  const household = await getDefaultHousehold();
  const quantityRaw = String(formData.get("quantity") ?? "").trim();
  const parsed = quantityRaw === "" ? null : Number(quantityRaw);
  const quantity = parsed != null && Number.isFinite(parsed) ? parsed : null;
  const unit = String(formData.get("unit") ?? "").trim() || null;

  await prisma.pantryItem.upsert({
    where: { householdId_itemId: { householdId: household.id, itemId } },
    update: {
      status,
      ...(quantityRaw === "" ? {} : { quantity }),
      ...(unit ? { unit } : {}),
    },
    create: {
      householdId: household.id,
      itemId,
      status,
      quantity,
      unit,
    },
  });
  revalidatePath("/pantry");
}

export async function removePantryItem(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.pantryItem.delete({ where: { id } });
  revalidatePath("/pantry");
}
