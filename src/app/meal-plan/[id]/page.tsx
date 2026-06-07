import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getDefaultHousehold } from "@/lib/context";
import { getRankedSuggestions } from "../data";
import { scaleIngredientQuantity } from "@/services/GroceryListGenerationService";
import { addEntry, updateEntryServings, removeEntry } from "../actions";

export const dynamic = "force-dynamic";

function fmtQty(n: number | null): string {
  if (n == null) return "";
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

export default async function MealPlanDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { id } = await params;
  const { error } = await searchParams;
  const household = await getDefaultHousehold();

  const plan = await prisma.mealPlan.findUnique({
    where: { id },
    include: {
      entries: {
        include: { recipe: { include: { ingredients: { orderBy: { position: "asc" } } } } },
      },
    },
  });
  if (!plan || plan.householdId !== household.id) notFound();

  const [recipes, ranked] = await Promise.all([
    prisma.recipe.findMany({
      where: { householdId: household.id },
      orderBy: { title: "asc" },
      select: { id: true, title: true, baseServings: true },
    }),
    getRankedSuggestions(household.id, plan.id),
  ]);

  const baseByRecipe = new Map(recipes.map((r) => [r.id, r.baseServings]));
  const inPlan = new Set(plan.entries.map((e) => e.recipeId));
  const suggestions = ranked.filter((r) => !inPlan.has(r.input.recipeId)).slice(0, 6);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">
          Week of {plan.weekStartDate.toISOString().slice(0, 10)}
        </h1>
        <Link href="/meal-plan" className="text-sm text-gray-500 hover:text-gray-900">
          ← All plans
        </Link>
      </div>

      {error ? (
        <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      ) : null}

      {/* Selected recipes */}
      <section className="space-y-2">
        <h2 className="font-semibold">Selected recipes ({plan.entries.length})</h2>
        {plan.entries.length === 0 ? (
          <p className="text-sm text-gray-400">No recipes selected yet.</p>
        ) : (
          <ul className="space-y-2">
            {plan.entries.map((e) => (
              <li
                key={e.id}
                className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-4 py-2 text-sm"
              >
                <span className="font-medium">{e.recipe.title}</span>
                <span className="flex items-center gap-2">
                  <form action={updateEntryServings} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="mealPlanId" value={plan.id} />
                    <span className="text-xs text-gray-500">serves</span>
                    <input
                      name="targetServings"
                      type="number"
                      min={1}
                      defaultValue={e.targetServings}
                      className="input w-20"
                    />
                    <button className="rounded border border-gray-300 px-2 py-1 text-xs hover:bg-gray-100">
                      Set
                    </button>
                  </form>
                  <span className="text-xs text-gray-400">(base {e.recipe.baseServings})</span>
                  <form action={removeEntry}>
                    <input type="hidden" name="id" value={e.id} />
                    <input type="hidden" name="mealPlanId" value={plan.id} />
                    <button className="text-xs text-red-600 hover:underline">Remove</button>
                  </form>
                </span>
              </li>
            ))}
          </ul>
        )}

        {/* Add a recipe */}
        <form action={addEntry} className="flex items-end gap-2 rounded-lg border border-gray-200 bg-white p-3">
          <input type="hidden" name="mealPlanId" value={plan.id} />
          <label className="text-xs text-gray-500">
            Recipe
            <select name="recipeId" required className="input mt-0.5 w-56" defaultValue="">
              <option value="">— choose —</option>
              {recipes.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.title}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs text-gray-500">
            Servings
            <input name="targetServings" type="number" min={1} className="input mt-0.5 w-20" placeholder="base" />
          </label>
          <button className="rounded bg-gray-900 px-3 py-1.5 text-sm text-white hover:bg-gray-700">
            Add
          </button>
        </form>
      </section>

      {/* Suggestions */}
      <section className="space-y-2">
        <h2 className="font-semibold">Suggestions</h2>
        {suggestions.length === 0 ? (
          <p className="text-sm text-gray-400">No other recipes to suggest.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <li key={s.input.recipeId}>
                <form action={addEntry}>
                  <input type="hidden" name="mealPlanId" value={plan.id} />
                  <input type="hidden" name="recipeId" value={s.input.recipeId} />
                  <input
                    type="hidden"
                    name="targetServings"
                    value={baseByRecipe.get(s.input.recipeId) ?? 4}
                  />
                  <button className="rounded-full border border-gray-300 px-3 py-1 text-sm hover:bg-gray-100">
                    + {s.input.title}
                    {s.input.favorite ? " ★" : ""}
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Scaled ingredient preview — what will feed the grocery list (full merge in M5) */}
      <section className="space-y-2">
        <h2 className="font-semibold">Scaled ingredients (preview)</h2>
        <p className="text-xs text-gray-400">
          Quantities scaled by target ÷ base servings; &ldquo;to taste&rdquo;-style
          (non-scalable) ingredients are left as-is.
        </p>
        {plan.entries.length === 0 ? (
          <p className="text-sm text-gray-400">Add recipes to see scaled quantities.</p>
        ) : (
          <div className="space-y-3">
            {plan.entries.map((e) => (
              <div key={e.id} className="rounded-lg border border-gray-200 bg-white p-3">
                <div className="mb-1 text-sm font-medium">
                  {e.recipe.title}{" "}
                  <span className="text-xs text-gray-400">
                    ×{(e.targetServings / e.recipe.baseServings).toFixed(2).replace(/\.?0+$/, "")}
                  </span>
                </div>
                <ul className="space-y-0.5 text-sm text-gray-600">
                  {e.recipe.ingredients.map((ing) => {
                    const scaled = scaleIngredientQuantity(
                      ing.quantity,
                      ing.scalable,
                      e.recipe.baseServings,
                      e.targetServings,
                    );
                    return (
                      <li key={ing.id} className="flex justify-between">
                        <span>
                          {ing.rawText}
                          {ing.optional ? <span className="text-gray-400"> (optional)</span> : null}
                          {!ing.scalable ? <span className="text-gray-400"> (not scaled)</span> : null}
                        </span>
                        <span className="tabular-nums text-gray-500">
                          {fmtQty(scaled)} {ing.recipeUnit ?? ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
