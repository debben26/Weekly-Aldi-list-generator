import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MEAL_COUNT_DEFAULT, MEAL_COUNT_MIN, MEAL_COUNT_MAX } from "@/services/MealPackageService";
import { generatePackage, useTheseMeals } from "../actions";
import MealCard from "./MealCard";
import AddMealPanel from "./AddMealPanel";
import WeatherWidget from "@/components/WeatherWidget";

export const dynamic = "force-dynamic";

export default async function MealsStep({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const { id: planId } = await params;
  const { notice, error } = await searchParams;

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    include: {
      entries: {
        // Stable order so swap/regenerate change only the affected card (Postgres has no implicit order).
        orderBy: { id: "asc" },
        include: {
          recipe: {
            include: { ingredients: { include: { item: true }, orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });
  if (!plan) notFound();

  // Saved recipes power the in-card swap search and the "Add a meal" browser (§6.4); the sort fields
  // mirror the Recipes tab.
  const savedRecipes = await prisma.recipe.findMany({
    where: { householdId: plan.householdId },
    select: {
      id: true,
      title: true,
      favorite: true,
      proteinType: true,
      complexity: true,
      estPrice: true,
    },
    orderBy: { title: "asc" },
  });

  const meals = plan.entries.map((e) => ({
    entryId: e.id,
    recipeId: e.recipeId,
    title: e.recipe.title,
    prepTime: e.recipe.prepTime,
    cookTime: e.recipe.cookTime,
    favorite: e.recipe.favorite,
    aldiFitStatus: e.recipe.aldiFitStatus as string,
    mainIngredients: e.recipe.ingredients
      .slice(0, 5)
      .map((ing) => ing.item?.canonicalName ?? ing.rawText),
  }));

  const weekLabel = plan.weekStartDate.toISOString().slice(0, 10);

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-aldi-navy">Plan your meals</h1>
        <p className="mt-1 text-sm text-gray-500">Week of {weekLabel}</p>
      </div>

      <WeatherWidget weekStart={weekLabel} />

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-aldi-red">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </div>
      ) : null}

      {meals.length === 0 ? (
        <section className="card p-6">
          <h2 className="font-semibold">How many meals do you want this week?</h2>
          <p className="mt-1 text-sm text-gray-500">
            We&apos;ll suggest a package from your saved meals. You can swap or remove any of them.
          </p>
          <form action={generatePackage} className="mt-4 flex items-end gap-3">
            <input type="hidden" name="planId" value={planId} />
            <label className="text-xs text-gray-500">
              <span className="mb-0.5 block">Meals</span>
              <input
                name="count"
                type="number"
                min={MEAL_COUNT_MIN}
                max={MEAL_COUNT_MAX}
                defaultValue={MEAL_COUNT_DEFAULT}
                required
                className="input w-24"
              />
            </label>
            <button className="rounded bg-aldi-navy px-4 py-2 text-sm text-white hover:bg-aldi-navy/90">
              Generate meals
            </button>
          </form>
        </section>
      ) : (
        <>
          <ul className="divide-y divide-gray-100 overflow-hidden card">
            {meals.map((meal) => (
              <MealCard key={meal.entryId} planId={planId} meal={meal} savedRecipes={savedRecipes} />
            ))}
          </ul>

          <AddMealPanel
            planId={planId}
            savedRecipes={savedRecipes}
            inPlanRecipeIds={meals.map((m) => m.recipeId)}
          />

          <div className="card p-4">
            <form action={useTheseMeals} className="flex items-center justify-between">
              <p className="text-sm text-gray-500">
                {meals.length} meal{meals.length === 1 ? "" : "s"} selected
              </p>
              <input type="hidden" name="planId" value={planId} />
              <button className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800">
                Use these meals →
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
}
