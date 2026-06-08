import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { MEAL_COUNT_DEFAULT, MEAL_COUNT_MIN, MEAL_COUNT_MAX } from "@/services/MealPackageService";
import { generatePackage, useTheseMeals } from "../actions";
import MealCard from "./MealCard";

export const dynamic = "force-dynamic";

export default async function MealsStep({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ notice?: string; error?: string; prompt?: string }>;
}) {
  const { id: planId } = await params;
  const { notice, error, prompt } = await searchParams;

  const plan = await prisma.mealPlan.findUnique({
    where: { id: planId },
    include: {
      entries: {
        include: {
          recipe: {
            include: { ingredients: { include: { item: true }, orderBy: { position: "asc" } } },
          },
        },
      },
    },
  });
  if (!plan) notFound();

  // All saved recipes (id + title) power the in-card swap search (§6.4).
  const savedRecipes = await prisma.recipe.findMany({
    where: { householdId: plan.householdId },
    select: { id: true, title: true },
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
        <h1 className="text-2xl font-semibold">Plan your meals</h1>
        <p className="mt-1 text-sm text-gray-500">Week of {weekLabel}</p>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {notice ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          {notice}
        </div>
      ) : null}

      {meals.length === 0 ? (
        <section className="rounded-lg border border-gray-200 bg-white p-6">
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
            <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
              Generate meals
            </button>
          </form>
        </section>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2">
            {meals.map((meal) => (
              <MealCard key={meal.entryId} planId={planId} meal={meal} savedRecipes={savedRecipes} />
            ))}
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <form action={generatePackage} className="mb-4 flex items-end gap-3 border-b border-gray-100 pb-4">
              <input type="hidden" name="planId" value={planId} />
              <label className="text-xs text-gray-500">
                <span className="mb-0.5 block">Add more (target total)</span>
                <input
                  name="count"
                  type="number"
                  min={meals.length + 1}
                  max={MEAL_COUNT_MAX}
                  defaultValue={meals.length + 1}
                  className="input w-24"
                />
              </label>
              <button className="rounded border border-gray-300 px-3 py-2 text-sm hover:bg-gray-100">
                Add suggestion
              </button>
            </form>

            {prompt === "rebuild" ? (
              <div className="rounded border border-amber-200 bg-amber-50 p-3">
                <p className="text-sm text-amber-800">
                  Changing meals will rebuild your grocery list and discard any manual edits to it.
                </p>
                <div className="mt-2 flex gap-2">
                  <form action={useTheseMeals}>
                    <input type="hidden" name="planId" value={planId} />
                    <input type="hidden" name="rebuild" value="true" />
                    <button className="rounded bg-gray-900 px-4 py-2 text-sm text-white hover:bg-gray-700">
                      Use these meals &amp; rebuild
                    </button>
                  </form>
                  <a
                    href={`/plan/${planId}/staples`}
                    className="rounded border border-gray-300 px-4 py-2 text-sm hover:bg-gray-100"
                  >
                    Keep current list
                  </a>
                </div>
              </div>
            ) : (
              <form action={useTheseMeals} className="flex items-center justify-between">
                <p className="text-sm text-gray-500">
                  {meals.length} meal{meals.length === 1 ? "" : "s"} selected
                </p>
                <input type="hidden" name="planId" value={planId} />
                <button className="rounded bg-green-700 px-4 py-2 text-sm text-white hover:bg-green-800">
                  Use these meals →
                </button>
              </form>
            )}
          </div>
        </>
      )}
    </div>
  );
}
