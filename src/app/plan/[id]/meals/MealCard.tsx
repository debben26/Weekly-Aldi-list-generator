"use client";

import { useEffect, useRef, useState } from "react";
import { removeMeal, regenerateMeal, swapMeal } from "../actions";
import RecipePicker, { type SavedRecipe } from "./RecipePicker";

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
  savedRecipes: SavedRecipe[];
}) {
  const [searching, setSearching] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  // Close the swap panel when the user clicks outside it (keeps the list tidy).
  useEffect(() => {
    if (!searching) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setSearching(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [searching]);

  // Exclude the current recipe from swap results; warn-and-allow on other dupes is deferred (§15.4).
  const swappable = savedRecipes.filter((r) => r.id !== meal.recipeId);

  const fit = ALDI_FIT_LABEL[meal.aldiFitStatus];

  return (
    <li className="px-4 py-2.5">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-medium">{meal.title}</span>
            {meal.favorite ? <span className="text-amber-500" title="Favorite">★</span> : null}
            {fit ? <span className="text-xs text-gray-400">· {fit}</span> : null}
          </div>
          {meal.mainIngredients.length > 0 ? (
            <p className="truncate text-xs text-gray-500">{meal.mainIngredients.join(", ")}</p>
          ) : (
            <p className="text-xs text-amber-700">No ingredients yet — won&apos;t add to your list.</p>
          )}
        </div>

        <div className="flex flex-shrink-0 flex-wrap gap-2 text-sm">
          <form action={removeMeal}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="entryId" value={meal.entryId} />
            <button className="btn-danger">
              Remove
            </button>
          </form>
          <form action={regenerateMeal}>
            <input type="hidden" name="planId" value={planId} />
            <input type="hidden" name="entryId" value={meal.entryId} />
            <button className="btn-secondary">
              New suggestion
            </button>
          </form>
          <button
            type="button"
            onClick={() => setSearching((s) => !s)}
            className="btn-secondary"
          >
            Swap
          </button>
        </div>
      </div>

      {searching ? (
        <div ref={panelRef} className="mt-3 border-t border-gray-100 pt-3">
          <RecipePicker
            recipes={swappable}
            renderAction={(r) => (
              // Close after the action resolves — a synchronous setState here would unmount the form
              // and cancel the submission before it dispatches.
              <form
                action={async (fd) => {
                  await swapMeal(fd);
                  setSearching(false);
                }}
              >
                <input type="hidden" name="planId" value={planId} />
                <input type="hidden" name="entryId" value={meal.entryId} />
                <input type="hidden" name="recipeId" value={r.id} />
                <button className="flex-shrink-0 btn-secondary px-2 py-0.5 text-xs">
                  Swap
                </button>
              </form>
            )}
          />
        </div>
      ) : null}
    </li>
  );
}
