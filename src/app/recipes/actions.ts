"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { findOrCreateItem } from "@/lib/items";
import { num } from "@/lib/forms";
import { computeAldiFit } from "@/services/MealSuggestionService";

export type RecipeFormState = { error?: string };

// Recompute and persist the recipe's derived Aldi fit (spec 8.4) after any ingredient change.
async function recomputeAldiFit(recipeId: string) {
  const ings = await prisma.recipeIngredient.findMany({
    where: { recipeId },
    select: { itemId: true, item: { select: { aldiFriendly: true } } },
  });
  const status = computeAldiFit(
    ings.map((i) => ({ itemId: i.itemId, aldiFriendly: i.item?.aldiFriendly ?? null })),
  );
  await prisma.recipe.update({ where: { id: recipeId }, data: { aldiFitStatus: status } });
}

function recipeData(formData: FormData) {
  return {
    title: String(formData.get("title") ?? "").trim(),
    notes: String(formData.get("notes") ?? "").trim() || null,
    baseServings: num(formData.get("baseServings")) ?? 4,
    prepTime: num(formData.get("prepTime")),
    cookTime: num(formData.get("cookTime")),
    favorite: formData.get("favorite") === "on",
    proteinType: String(formData.get("proteinType") ?? "").trim() || null,
    complexity: (() => {
      const n = num(formData.get("complexity"));
      return n == null ? null : Math.round(n);
    })(),
    estPrice: num(formData.get("estPrice")),
  };
}

export async function createRecipe(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const data = recipeData(formData);
  if (!data.title) return { error: "Title is required." };

  const household = await getDefaultHousehold();
  const recipe = await prisma.recipe.create({
    data: { ...data, householdId: household.id },
  });
  revalidatePath("/recipes");
  redirect(`/recipes/${recipe.id}`); // continue to add ingredients
}

export async function updateRecipe(
  _prev: RecipeFormState,
  formData: FormData,
): Promise<RecipeFormState> {
  const id = String(formData.get("id") ?? "");
  const data = recipeData(formData);
  if (!id) return { error: "Missing recipe id." };
  if (!data.title) return { error: "Title is required." };

  await prisma.recipe.update({ where: { id }, data });
  revalidatePath("/recipes");
  redirect(`/recipes/${id}`);
}

export async function deleteRecipe(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  if (!id) return;

  // MealPlanEntry references are restrict-by-default; clear them first (ingredients cascade).
  await prisma.$transaction([
    prisma.mealPlanEntry.deleteMany({ where: { recipeId: id } }),
    prisma.recipe.delete({ where: { id } }),
  ]);
  revalidatePath("/recipes");
  redirect("/recipes");
}

export async function addIngredient(formData: FormData) {
  const recipeId = String(formData.get("recipeId") ?? "");
  if (!recipeId) return;

  // A typed-in name creates (or reuses) a catalog item and maps to it; otherwise use the picker.
  const newItemName = String(formData.get("newItemName") ?? "").trim();
  const pickedItemId = String(formData.get("itemId") ?? "") || null;
  if (!newItemName && !pickedItemId) {
    redirect(`/recipes/${recipeId}?error=${encodeURIComponent("Pick an item or add a new one.")}`);
  }

  const itemId = newItemName ? await findOrCreateItem(newItemName) : pickedItemId;

  // rawText is a required column kept as a display fallback (10.3); derive it from the catalog item.
  const rawText =
    newItemName ||
    (await prisma.item.findUnique({ where: { id: itemId! }, select: { canonicalName: true } }))
      ?.canonicalName ||
    "";

  const last = await prisma.recipeIngredient.findFirst({
    where: { recipeId },
    orderBy: { position: "desc" },
  });
  await prisma.recipeIngredient.create({
    data: {
      recipeId,
      rawText,
      itemId,
      quantity: num(formData.get("quantity")),
      recipeUnit: String(formData.get("recipeUnit") ?? "").trim() || null,
      optional: formData.get("optional") === "on",
      scalable: formData.get("scalable") === "on",
      position: (last?.position ?? -1) + 1,
    },
  });
  await recomputeAldiFit(recipeId);
  revalidatePath(`/recipes/${recipeId}`);
}

export async function updateIngredient(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  await prisma.recipeIngredient.update({
    where: { id },
    data: {
      itemId: String(formData.get("itemId") ?? "") || null,
      quantity: num(formData.get("quantity")),
      recipeUnit: String(formData.get("recipeUnit") ?? "").trim() || null,
      optional: formData.get("optional") === "on",
      scalable: formData.get("scalable") === "on",
    },
  });
  await recomputeAldiFit(recipeId);
  revalidatePath(`/recipes/${recipeId}`);
}

export async function removeIngredient(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  await prisma.recipeIngredient.delete({ where: { id } });
  await recomputeAldiFit(recipeId);
  revalidatePath(`/recipes/${recipeId}`);
}
