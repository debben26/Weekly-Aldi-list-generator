"use client";

import { useState } from "react";
import { searchRecipesByName } from "@/services/MealPackageService";
import { removeMeal, regenerateMeal, swapMeal } from "../actions";

type Meal = {
  entryId: string;
  recipeId: string;
  title: string;
  prepTime: number | null;
  cookTime: number | null;
  favorite: boolean;
  aldiFitStatus: string;
  mainIngredients: string[];
};

const ALDI_FIT_LABEL: Record<string, string> = {
  good: "Great Aldi fit",
  medium: "Decent Aldi fit",
  low: "Low Aldi fit",
  unknown: "",
};

export default function MealCard({
  planId,
  meal,
  savedRecipes,
}: {
  planId: string;
  meal: Meal;
  savedRecipes: { id: string; title: string }[];
}) {
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");

  // Exclude the current recipe from results; warn-and-allow on other dupes is deferred (§15.4).
  const results = searchRecipesByName(savedRecipes, query)
    .filter((r) => r.id !== meal.recipeId)
    .slice(0, 8);

  const time = [meal.prepTime ? `Prep ${meal.prepTime}m` : null, meal.cookTime ? `Cook ${meal.cookTime}m` : null]
    .filter(Boolean)
    .join(" · ");
  const fit = ALDI_FIT_LABEL[meal.aldiFitStatus];

  return (
    <div className="flex flex-col rounded-lg border border-gray-200 bg-white p-4">
      <div className="flex items-start justify-between gap-2">
        <h3 className="font-semibold">
          {meal.title}
          {meal.favorite ? <span className="ml-1 text-amber-500" title="Favorite">★</span> : null}
        </h3>
      </div>
      <div className="mt-1 space-y-0.5 text-xs text-gray-500">
        {time ? <p>{time}</p> : null}
        {fit ? <p>{fit}</p> : null}
        {meal.mainIngredients.length > 0 ? (
          <p className="text-gray-600">{meal.mainIngredients.join(", ")}</p>
        ) : (
          <p className="text-amber-700">No ingredients yet — won&apos;t add to your list.</p>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2 text-sm">
        <form action={removeMeal}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="entryId" value={meal.entryId} />
          <button className="rounded border border-red-200 px-2.5 py-1 text-red-600 hover:bg-red-50">
            Remove
          </button>
        </form>
        <form action={regenerateMeal}>
          <input type="hidden" name="planId" value={planId} />
          <input type="hidden" name="entryId" value={meal.entryId} />
          <button className="rounded border border-gray-300 px-2.5 py-1 hover:bg-gray-100">
            New suggestion
          </button>
        </form>
        <button
          type="button"
          onClick={() => setSearching((s) => !s)}
          className="rounded border border-gray-300 px-2.5 py-1 hover:bg-gray-100"
        >
          Swap
        </button>
      </div>

      {searching ? (
        <div className="mt-3 border-t border-gray-100 pt-3">
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search my meals…"
            className="input w-full"
          />
          {results.length === 0 ? (
            <p className="mt-2 text-xs text-gray-400">No matching meals found.</p>
          ) : (
            <ul className="mt-2 max-h-48 space-y-1 overflow-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <form action={swapMeal}>
                    <input type="hidden" name="planId" value={planId} />
                    <input type="hidden" name="entryId" value={meal.entryId} />
                    <input type="hidden" name="recipeId" value={r.id} />
                    <button className="w-full rounded px-2 py-1 text-left text-sm hover:bg-gray-100">
                      {r.title}
                    </button>
                  </form>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
