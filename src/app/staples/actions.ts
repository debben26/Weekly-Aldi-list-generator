"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { findOrCreateItem } from "@/lib/items";

function backWithError(message: string): never {
  redirect(`/staples?error=${encodeURIComponent(message)}`);
}

function parseNumber(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function parseDate(v: FormDataEntryValue | null): Date | null {
  const s = String(v ?? "").trim();
  if (s === "") return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function todayDateOnly(): Date {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function createStapleRule(formData: FormData) {
  const ruleType = String(formData.get("ruleType") ?? "");
  // A typed-in name creates (or reuses) a catalog item; otherwise use the picker selection.
  const newItemName = String(formData.get("newItemName") ?? "").trim();
  const itemId = newItemName
    ? await findOrCreateItem(newItemName)
    : String(formData.get("itemId") ?? "");
  if (!itemId) backWithError("Choose an item or add a new one.");
  if (ruleType !== "weekly" && ruleType !== "restock") backWithError("Invalid rule type.");

  const household = await getDefaultHousehold();
  const item = await prisma.item.findUnique({ where: { id: itemId } });
  if (!item) backWithError("Item not found.");

  await prisma.stapleRule.create({
    data: {
      householdId: household.id,
      itemId,
      ruleType,
      defaultQuantity: parseNumber(formData.get("defaultQuantity")),
      defaultUnit: String(formData.get("defaultUnit") ?? "").trim() || item.purchaseUnit,
      defaultSectionId: String(formData.get("defaultSectionId") ?? "") || null,
      notes: String(formData.get("notes") ?? "").trim() || null,
      expectedIntervalDays:
        ruleType === "restock" ? parseNumber(formData.get("expectedIntervalDays")) : null,
      lastPurchasedDate:
        ruleType === "restock" ? parseDate(formData.get("lastPurchasedDate")) : null,
    },
  });
  revalidatePath("/staples");
}

export async function setStapleActive(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const active = String(formData.get("active") ?? "") === "true";
  await prisma.stapleRule.update({ where: { id }, data: { active } });
  revalidatePath("/staples");
}

// Restock review actions (spec 6.4).
export async function snoozeRestock(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const days = parseNumber(formData.get("days")) ?? 7;
  const until = todayDateOnly();
  until.setDate(until.getDate() + days);
  await prisma.stapleRule.update({ where: { id }, data: { snoozedUntil: until } });
  revalidatePath("/staples");
}

export async function unsnoozeRestock(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.stapleRule.update({ where: { id }, data: { snoozedUntil: null } });
  revalidatePath("/staples");
}

export async function markPurchased(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.stapleRule.update({
    where: { id },
    data: { lastPurchasedDate: todayDateOnly(), snoozedUntil: null },
  });
  revalidatePath("/staples");
}

// Lightweight edit so the cadence can be tuned (and the engine exercised) without a list yet.
export async function updateRestock(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  await prisma.stapleRule.update({
    where: { id },
    data: {
      expectedIntervalDays: parseNumber(formData.get("expectedIntervalDays")),
      lastPurchasedDate: parseDate(formData.get("lastPurchasedDate")),
    },
  });
  revalidatePath("/staples");
}
