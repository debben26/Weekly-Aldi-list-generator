"use client";

import { useEffect, useRef, useState } from "react";
import { addMealToPlan } from "../actions";
import RecipePicker, { type SavedRecipe } from "./RecipePicker";

// "Add a meal" browser: search + sort the saved recipes not already in the plan, then add one.
export default function AddMealPanel({
  planId,
  savedRecipes,
  inPlanRecipeIds,
}: {
  planId: string;
  savedRecipes: SavedRecipe[];
  inPlanRecipeIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const inPlan = new Set(inPlanRecipeIds);
  const addable = savedRecipes.filter((r) => !inPlan.has(r.id));

  return (
    <div ref={panelRef} className="card p-4">
      {open ? (
        <RecipePicker
          recipes={addable}
          emptyText="No other saved meals to add."
          renderAction={(r) => (
            // Close after the action resolves — closing synchronously in the button's onClick would
            // unmount the form and cancel the submission before it dispatches.
            <form
              action={async (fd) => {
                await addMealToPlan(fd);
                setOpen(false);
              }}
            >
              <input type="hidden" name="planId" value={planId} />
              <input type="hidden" name="recipeId" value={r.id} />
              <button className="flex-shrink-0 btn-secondary px-2 py-0.5 text-xs">
                Add
              </button>
            </form>
          )}
        />
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="btn-secondary px-3 py-1.5"
        >
          + Add a meal
        </button>
      )}
    </div>
  );
}
