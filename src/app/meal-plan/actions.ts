"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { num } from "@/lib/forms";

export async function createMealPlan(formData: FormData) {
  const weekStartRaw = String(formData.get("weekStartDate") ?? "").trim();
  if (!weekStartRaw) redirect(`/meal-plan?error=${encodeURIComponent("Pick a week start date.")}`);
  const weekStartDate = new Date(weekStartRaw);
  if (Number.isNaN(weekStartDate.getTime())) {
    redirect(`/meal-plan?error=${encodeURIComponent("Invalid date.")}`);
  }

  const household = await getDefaultHousehold();
  const plan = await prisma.mealPlan.create({
    data: { householdId: household.id, weekStartDate, status: "draft" },
  });
  redirect(`/meal-plan/${plan.id}`);
}

export async function addEntry(formData: FormData) {
  const mealPlanId = String(formData.get("mealPlanId") ?? "");
  const recipeId = String(formData.get("recipeId") ?? "");
  if (!mealPlanId || !recipeId) {
    redirect(`/meal-plan/${mealPlanId}?error=${encodeURIComponent("Choose a recipe.")}`);
  }

  const recipe = await prisma.recipe.findUnique({ where: { id: recipeId } });
  if (!recipe) redirect(`/meal-plan/${mealPlanId}?error=${encodeURIComponent("Recipe not found.")}`);

  const targetServings = num(formData.get("targetServings")) ?? recipe.baseServings;
  await prisma.mealPlanEntry.create({
    data: { mealPlanId, recipeId, targetServings },
  });
  revalidatePath(`/meal-plan/${mealPlanId}`);
}

export async function updateEntryServings(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const mealPlanId = String(formData.get("mealPlanId") ?? "");
  const targetServings = num(formData.get("targetServings"));
  if (targetServings != null && targetServings > 0) {
    await prisma.mealPlanEntry.update({ where: { id }, data: { targetServings } });
  }
  revalidatePath(`/meal-plan/${mealPlanId}`);
}

export async function removeEntry(formData: FormData) {
  const id = String(formData.get("id") ?? "");
  const mealPlanId = String(formData.get("mealPlanId") ?? "");
  await prisma.mealPlanEntry.delete({ where: { id } });
  revalidatePath(`/meal-plan/${mealPlanId}`);
}
