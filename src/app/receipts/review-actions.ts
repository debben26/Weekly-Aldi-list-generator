"use server";

import { revalidatePath } from "next/cache";
import * as review from "@/app/receipts/review";

// Thin "use server" wrappers over the testable review core (see review.ts). Each parses FormData,
// calls the core operation, and revalidates the receipt page the buttons live on.

export async function setLineMatch(formData: FormData): Promise<void> {
  const lineId = String(formData.get("lineId") ?? "");
  const itemId = String(formData.get("itemId") ?? "");
  if (!lineId || !itemId) return;
  const receiptId = await review.setLineMatch(lineId, itemId);
  revalidatePath(`/receipts/${receiptId}`);
}

// useActionState-style: returns an error to show inline (duplicate name, missing fields) so the
// create-new form in the review queue can surface it without a hard crash.
export type CreateItemFormState = { error?: string };

export async function createItemForLine(
  _prev: CreateItemFormState,
  formData: FormData,
): Promise<CreateItemFormState> {
  const lineId = String(formData.get("lineId") ?? "");
  const canonicalName = String(formData.get("canonicalName") ?? "").trim();
  const purchaseUnit = String(formData.get("purchaseUnit") ?? "").trim();
  if (!lineId) return { error: "That receipt line no longer exists." };
  if (!canonicalName) return { error: "Item name is required." };
  if (!purchaseUnit) return { error: "Purchase unit is required." };

  const result = await review.createItemForLine(lineId, {
    canonicalName,
    purchaseUnit,
    defaultSectionId: String(formData.get("defaultSectionId") ?? "") || null,
    food: formData.get("food") === "on",
    aldiFriendly: formData.get("aldiFriendly") === "on",
  });
  if (!result.ok) return { error: result.error };

  revalidatePath(`/receipts/${result.receiptId}`);
  return {};
}

export async function skipLine(formData: FormData): Promise<void> {
  const lineId = String(formData.get("lineId") ?? "");
  if (!lineId) return;
  const receiptId = await review.skipLine(lineId);
  revalidatePath(`/receipts/${receiptId}`);
}
